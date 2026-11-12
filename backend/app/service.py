"""Care workflow: the state machine that ties triage decisions to money movement.

Statuses
  emergency_routed  emergency: patient sent to ER, no payment ever requested
  triaged           decision made, patient choosing a provider
  awaiting_payment  PayPal order created, waiting for patient approval
  funds_held        authorization placed (money held, not taken)
  completed         consult confirmed, payment captured, provider paid out
  cancelled         visit did not happen, authorization voided
  rebook_required   clinician up-triaged to a different service; hold released

Review (independent of status): none | pending | confirmed | retriaged
"""

from __future__ import annotations

from .agent.orchestrator import SERVICE_FOR_LEVEL, TriageAgent
from .config import Settings
from .knowledge import LEVEL_RANK, load_providers
from .payments.paypal import MockPayPal, PaymentGateway, PayPalError
from .store import Store, now_iso

PLATFORM_FEE_RATE = 0.05


class WorkflowError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def provider_by_id(pid: str) -> dict | None:
    return next((p for p in load_providers() if p["id"] == pid), None)


def cheapest_price(level: str) -> float | None:
    prices = [p["price"] for p in load_providers() if level in p["levels"]]
    return min(prices) if prices else None


class CareService:
    def __init__(self, settings: Settings, store: Store, gateway: PaymentGateway, agent: TriageAgent):
        self.settings = settings
        self.store = store
        self.gateway = gateway
        # Seeded sample cases always use this simulated gateway, never the real PayPal account.
        self.demo_gateway = MockPayPal(mode="demo")
        self.agent = agent

    # ---- helpers -------------------------------------------------------
    def _get(self, case_id: str) -> dict:
        case = self.store.get_case(case_id)
        if not case:
            raise WorkflowError("Case not found", 404)
        return case

    def _save(self, case: dict) -> dict:
        case["updated_at"] = now_iso()
        self.store.save_case(case)
        case["events"] = self.store.events(case["id"])
        return case

    def _gw(self, case: dict) -> PaymentGateway:
        return self.demo_gateway if case["payment"].get("mode") == "demo" else self.gateway

    def _pay(self, fn, *args):
        try:
            return fn(*args)
        except PayPalError as exc:
            raise WorkflowError(str(exc), 502) from exc

    # ---- triage --------------------------------------------------------
    def triage(self, symptoms: str, age: int | None, sex: str | None, duration: str | None,
               patient_name: str | None = None, location: str | None = None, demo: bool = False) -> dict:
        # Demo seeding uses the deterministic engine: fast, free and identical on every boot.
        result = self.agent.run(symptoms, age, sex, duration, use_llm=not demo)
        case_id = self.store.new_case_id()
        emergency = result["level"] == "emergency"
        case = {
            "id": case_id,
            "created_at": now_iso(),
            "patient": {"name": patient_name or "Anonymous", "age": age, "sex": sex, "duration": duration,
                        "location": location, "symptoms": symptoms},
            "triage": result,
            "status": "emergency_routed" if emergency else "triaged",
            "review": {"status": "pending" if result["escalated"] else "none", "reasons": result["escalation_reasons"],
                       "clinician_note": None, "original_level": result["level"]},
            "provider": None,
            "payment": {"required": not emergency, "mode": "demo" if demo else self.gateway.mode, "currency": self.settings.currency,
                        "status": "not_required" if emergency else "not_started", "amount": 0.0,
                        "captured": 0.0, "refunded": 0.0, "platform_fee": 0.0, "payout_amount": 0.0},
        }
        self.store.log(case_id, "triage", "agent",
                       f"Triaged as {result['level']} ({result['engine']}, confidence {result['confidence']:.2f})",
                       {"citations": [c["guideline_id"] for c in result["citations"]], "red_flags": result["red_flags"]})
        if emergency:
            self.store.log(case_id, "emergency_bypass", "guardrail",
                           "Emergency detected: patient directed to emergency care. Payment step skipped entirely.")
        if result["escalated"]:
            self.store.log(case_id, "escalation", "guardrail", "Sent to clinician review: " + "; ".join(result["escalation_reasons"]))
        return self._save(case)

    # ---- payment flow --------------------------------------------------
    def checkout(self, case_id: str, provider_id: str) -> dict:
        case = self._get(case_id)
        if not case["payment"]["required"]:
            raise WorkflowError("Emergency cases never require payment. Go to the emergency department now.", 409)
        if case["status"] not in {"triaged", "awaiting_payment", "rebook_required"}:
            raise WorkflowError(f"Cannot start checkout from status '{case['status']}'", 409)
        provider = provider_by_id(provider_id)
        level = case["triage"]["level"]
        if not provider or level not in provider["levels"]:
            raise WorkflowError(f"Provider does not offer {level} care", 400)
        order = self._pay(self._gw(case).create_order, provider["price"], self.settings.currency,
                          f"CareRoute {SERVICE_FOR_LEVEL[level].split(' - ')[0]} - {provider['name']}", case_id)
        case["provider"] = provider
        case["status"] = "awaiting_payment"
        case["payment"].update({"status": "order_created", "order_id": order["id"], "amount": provider["price"],
                                "approve_url": order.get("approve_url")})
        self.store.log(case_id, "order_created", "paypal",
                       f"PayPal order {order['id']} created (intent AUTHORIZE) for {provider['price']:.2f} {self.settings.currency}",
                       {"provider": provider["id"]})
        return self._save(case)

    def authorize(self, case_id: str, order_id: str) -> dict:
        case = self._get(case_id)
        if case["payment"].get("order_id") != order_id:
            raise WorkflowError("Order does not belong to this case", 400)
        if case["status"] != "awaiting_payment":
            raise WorkflowError(f"Cannot authorize from status '{case['status']}'", 409)
        auth = self._pay(self._gw(case).authorize_order, order_id)
        case["status"] = "funds_held"
        case["payment"].update({"status": "authorized", "authorization_id": auth["authorization_id"],
                                "authorization_expires_at": auth.get("expires_at"), "payer_email": auth.get("payer_email")})
        self.store.log(case_id, "authorized", "paypal",
                       f"Funds held: authorization {auth['authorization_id']} for {case['payment']['amount']:.2f}. "
                       "Nothing is captured until the provider confirms the consultation.")
        return self._save(case)

    def confirm_consult(self, case_id: str, note: str | None = None) -> dict:
        """Provider confirms the consultation happened -> capture -> payout."""
        case = self._get(case_id)
        if case["status"] != "funds_held":
            raise WorkflowError(f"Cannot confirm consult from status '{case['status']}'", 409)
        if case["review"]["status"] == "pending":
            raise WorkflowError("A clinician must review this escalated case before payment is captured", 409)
        pay = case["payment"]
        amount = round(pay.get("adjusted_amount", pay["amount"]), 2)
        cap = self._pay(self._gw(case).capture_authorization, pay["authorization_id"], amount, self.settings.currency,
                        f"{case_id}-{pay['authorization_id'][-6:]}")
        pay.update({"status": "captured", "capture_id": cap["capture_id"], "captured": amount})
        self.store.log(case_id, "captured", "paypal",
                       f"Consult confirmed by {case['provider']['name']}; captured {amount:.2f}"
                       + (f" (reduced from {pay['amount']:.2f} after clinician review)" if amount < pay["amount"] else ""),
                       {"note": note})
        self._payout(case)
        case["status"] = "completed"
        return self._save(case)

    def _payout(self, case: dict) -> None:
        pay, provider = case["payment"], case["provider"]
        fee = round(pay["captured"] * PLATFORM_FEE_RATE, 2)
        net = round(pay["captured"] - pay.get("refunded", 0.0) - fee, 2)
        if net <= 0 or not provider.get("paypal_email"):
            return
        out = self._pay(self._gw(case).create_payout, provider["paypal_email"], net, self.settings.currency,
                        f"CareRoute consultation {case['id']}", f"{case['id']}-{pay['capture_id'][-6:]}")
        pay.update({"platform_fee": fee, "payout_amount": net, "payout_batch_id": out["payout_batch_id"],
                    "payout_status": out["status"]})
        self.store.log(case["id"], "payout", "paypal",
                       f"Paid out {net:.2f} to {provider['name']} via PayPal Payouts (platform fee {fee:.2f})",
                       {"batch": out["payout_batch_id"]})

    def cancel(self, case_id: str, reason: str) -> dict:
        case = self._get(case_id)
        if case["status"] == "funds_held":
            self._pay(self._gw(case).void_authorization, case["payment"]["authorization_id"])
            case["payment"]["status"] = "voided"
            self.store.log(case_id, "voided", "paypal", f"Authorization voided, hold released: {reason}")
        elif case["status"] in {"triaged", "awaiting_payment"}:
            case["payment"]["status"] = "cancelled"
        else:
            raise WorkflowError(f"Cannot cancel from status '{case['status']}'", 409)
        case["status"] = "cancelled"
        self.store.log(case_id, "cancelled", "provider", reason)
        return self._save(case)

    # ---- clinician review ----------------------------------------------
    def review(self, case_id: str, action: str, new_level: str | None, note: str | None, clinician: str = "Clinician") -> dict:
        case = self._get(case_id)
        review = case["review"]
        old = case["triage"]["level"]
        if action == "confirm":
            review.update({"status": "confirmed", "clinician_note": note, "reviewed_by": clinician})
            self.store.log(case_id, "review_confirmed", "clinician", f"{clinician} confirmed '{old}' triage. {note or ''}".strip())
            return self._save(case)
        if action != "retriage" or new_level not in LEVEL_RANK:
            raise WorkflowError("action must be 'confirm' or 'retriage' with a valid new_level")
        if new_level == old:
            raise WorkflowError("New level is the same as the current level")

        case["triage"]["level"] = new_level
        case["triage"]["recommended_service"] = SERVICE_FOR_LEVEL[new_level]
        case["triage"]["providers"] = self.agent.providers_for(new_level)
        case["triage"]["payment_required"] = new_level != "emergency"
        review.update({"status": "retriaged", "clinician_note": note, "reviewed_by": clinician, "new_level": new_level})
        self.store.log(case_id, "retriaged", "clinician", f"{clinician} re-triaged {old} -> {new_level}. {note or ''}".strip())

        pay = case["payment"]
        if new_level == "emergency":
            pay["required"] = False
            if case["status"] == "funds_held":
                self._pay(self._gw(case).void_authorization, pay["authorization_id"])
                pay["status"] = "voided"
                self.store.log(case_id, "voided", "paypal", "Up-triaged to emergency: payment hold released in full")
            elif case["status"] == "completed" and pay["captured"] > pay["refunded"]:
                amount = round(pay["captured"] - pay["refunded"], 2)
                self._refund(case, amount, "Escalated to emergency care - full refund")
            case["status"] = "emergency_routed"
            self.store.log(case_id, "emergency_bypass", "guardrail", "Patient directed to emergency care; no payment required")
        elif LEVEL_RANK[new_level] < LEVEL_RANK[old]:
            target = cheapest_price(new_level) or 0.0
            if case["status"] == "funds_held":
                new_amount = round(min(target, pay["amount"]), 2)
                pay["adjusted_amount"] = new_amount
                self.store.log(case_id, "adjusted", "agent",
                               f"Down-triaged: will capture only {new_amount:.2f} of the {pay['amount']:.2f} held")
            elif case["status"] == "completed":
                diff = round(pay["captured"] - min(target, pay["captured"]), 2)
                if diff > 0:
                    self._refund(case, diff, f"Care level reduced to {new_level.replace('_', ' ')} - partial refund")
            elif case["status"] in {"triaged", "awaiting_payment", "rebook_required"}:
                case["status"] = "triaged"
        else:  # up-triaged to a more urgent, paid level
            if case["status"] == "funds_held":
                self._pay(self._gw(case).void_authorization, pay["authorization_id"])
                pay["status"] = "voided"
                self.store.log(case_id, "voided", "paypal", "Up-triaged: hold released so the patient can book the right service")
                case["status"] = "rebook_required"
            elif case["status"] in {"triaged", "awaiting_payment"}:
                case["status"] = "triaged"
        return self._save(case)

    def _refund(self, case: dict, amount: float, note: str) -> None:
        pay = case["payment"]
        out = self._pay(self._gw(case).refund_capture, pay["capture_id"], amount, self.settings.currency, note)
        pay["refunded"] = round(pay.get("refunded", 0.0) + amount, 2)
        pay["status"] = "refunded" if pay["refunded"] >= pay["captured"] else "partially_refunded"
        self.store.log(case["id"], "refunded", "paypal", f"Refunded {amount:.2f}: {note}", {"refund_id": out["refund_id"]})

    # ---- webhooks --------------------------------------------------------
    def handle_webhook(self, event: dict) -> dict:
        etype = event.get("event_type", "")
        resource = event.get("resource", {})
        case = None
        if etype.startswith("PAYMENT.AUTHORIZATION"):
            case = self.store.find_by_payment("authorization_id", resource.get("id", ""))
        elif etype.startswith("PAYMENT.CAPTURE"):
            case = self.store.find_by_payment("capture_id", resource.get("id", ""))
        elif etype.startswith("CHECKOUT.ORDER"):
            case = self.store.find_by_payment("order_id", resource.get("id", ""))
        elif etype.startswith("PAYMENT.PAYOUTSBATCH"):
            batch = resource.get("batch_header", {}).get("payout_batch_id", "")
            case = self.store.find_by_payment("payout_batch_id", batch)
            if case:
                case["payment"]["payout_status"] = resource.get("batch_header", {}).get("batch_status", "")
                self.store.save_case(case)
        self.store.log(case["id"] if case else None, "webhook", "paypal", f"Webhook {etype}", {"event_id": event.get("id")})
        return {"received": True, "matched_case": case["id"] if case else None}

    # ---- stats -----------------------------------------------------------
    def stats(self) -> dict:
        cases = self.store.list_cases(5000)
        by_level = {lvl: 0 for lvl in LEVEL_RANK}
        by_status: dict[str, int] = {}
        held = captured = refunded = paid_out = fees = 0.0
        escalated = emergencies = reviews_pending = 0
        conf = []
        for c in cases:
            by_level[c["triage"]["level"]] = by_level.get(c["triage"]["level"], 0) + 1
            by_status[c["status"]] = by_status.get(c["status"], 0) + 1
            p = c["payment"]
            if c["status"] == "funds_held":
                held += p.get("adjusted_amount", p["amount"])
            captured += p.get("captured", 0.0)
            refunded += p.get("refunded", 0.0)
            paid_out += p.get("payout_amount", 0.0)
            fees += p.get("platform_fee", 0.0)
            escalated += 1 if c["triage"].get("escalated") else 0
            emergencies += 1 if c["status"] == "emergency_routed" else 0
            reviews_pending += 1 if c["review"]["status"] == "pending" else 0
            conf.append(c["triage"]["confidence"])
        n = len(cases)
        return {
            "total_cases": n, "by_level": by_level, "by_status": by_status,
            "escalation_rate": round(escalated / n, 3) if n else 0.0,
            "emergency_bypasses": emergencies, "reviews_pending": reviews_pending,
            "avg_confidence": round(sum(conf) / n, 3) if n else 0.0,
            "money": {"held": round(held, 2), "captured": round(captured, 2), "refunded": round(refunded, 2),
                      "paid_out": round(paid_out, 2), "platform_fees": round(fees, 2), "currency": self.settings.currency},
        }
