import assert from "node:assert/strict";
import {
  eventHasRegistrationFees,
  registrationFeeAmount,
  resolveEffectiveRegistrationFee,
} from "./registration-fee";
import type { RegistrationFee } from "@/types";

// Avoid importing chicago-time quirks — pin "now" via fee validUntil relative to a fixed date.
const now = new Date("2026-09-30T17:00:00-05:00");

const cupFees: RegistrationFee[] = [
  { type: "Early Bird", amount: 127, description: "Until Sept 15th", validUntil: "2026-09-15" },
  { type: "Regular", amount: 153, description: "Until Sept 30th", validUntil: "2026-09-30" },
  { type: "Late", amount: 172, description: "Registration Ends Oct 7th", validUntil: "2026-10-07" },
];

{
  const fee = resolveEffectiveRegistrationFee(cupFees, now);
  assert.equal(fee?.type, "Regular");
  assert.equal(registrationFeeAmount(cupFees, now), 153);
  assert.equal(eventHasRegistrationFees(cupFees), true);
}

{
  // Blank $0 placeholder must not win over real tiers
  const fees: RegistrationFee[] = [
    { type: "", amount: 0, description: "", validUntil: "" },
    ...cupFees,
  ];
  assert.equal(resolveEffectiveRegistrationFee(fees, now)?.type, "Regular");
  assert.equal(registrationFeeAmount(fees, now), 153);
}

{
  // After Regular expires → Late
  const after = new Date("2026-10-01T12:00:00-05:00");
  assert.equal(resolveEffectiveRegistrationFee(cupFees, after)?.type, "Late");
  assert.equal(registrationFeeAmount(cupFees, after), 172);
}

{
  assert.equal(registrationFeeAmount([]), null);
  assert.equal(eventHasRegistrationFees([{ type: "x", amount: 0 }]), false);
  assert.equal(registrationFeeAmount([{ type: "x", amount: 0, validUntil: "" }], now), null);
}

console.log("registration-fee: all assertions passed");
