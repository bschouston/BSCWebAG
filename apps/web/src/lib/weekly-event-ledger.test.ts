import assert from "node:assert/strict";
import { memberTokenTotals, type WeeklyLedgerTxInput } from "./weekly-event-ledger";

function hold(rsvpId: string, gen: number, amount: number): WeeklyLedgerTxInput {
  return {
    type: "DEBIT",
    amount,
    reason: "rsvp_hold",
    description: "Hold",
    idempotencyKey: `rsvp_hold_${rsvpId}_g${gen}`,
  };
}

function cancelRefund(rsvpId: string, gen: number, amount: number): WeeklyLedgerTxInput {
  return {
    type: "CREDIT",
    amount,
    reason: "rsvp_cancel_refund",
    description: "RSVP cancelled",
    idempotencyKey: `rsvp_cancel_refund_${rsvpId}_g${gen}`,
  };
}

function settleRefund(rsvpId: string, amount: number): WeeklyLedgerTxInput {
  return {
    type: "CREDIT",
    amount,
    reason: "rsvp_settle_refund",
    description: "Unused hold refunded",
    idempotencyKey: `rsvp_settle_refund_${rsvpId}`,
  };
}

function assertIdentity(txs: WeeklyLedgerTxInput[], fallbackHeld = 0) {
  const t = memberTokenTotals(txs, fallbackHeld);
  assert.equal(t.tokensHeld - t.tokensRefunded, t.tokensCharged);
  return t;
}

// 3× signup/cancel @ 14 → held 14, charged 0, refunded 14 (not 42)
{
  const rsvpId = "U8Ju86hLlP7PBp9cEpYX_user";
  const txs = [
    hold(rsvpId, 1, 14),
    cancelRefund(rsvpId, 1, 14),
    hold(rsvpId, 2, 14),
    cancelRefund(rsvpId, 2, 14),
    hold(rsvpId, 3, 14),
    cancelRefund(rsvpId, 3, 14),
  ];
  assert.deepEqual(assertIdentity(txs), {
    tokensHeld: 14,
    tokensCharged: 0,
    tokensRefunded: 14,
  });
}

// Single cancel
{
  const rsvpId = "evt_user";
  const txs = [hold(rsvpId, 1, 14), cancelRefund(rsvpId, 1, 14)];
  assert.deepEqual(assertIdentity(txs), {
    tokensHeld: 14,
    tokensCharged: 0,
    tokensRefunded: 14,
  });
}

// Attended: hold 14 + settle credit 4 → charged 10, refunded 4
{
  const rsvpId = "evt_user2";
  const txs = [hold(rsvpId, 1, 14), settleRefund(rsvpId, 4)];
  assert.deepEqual(assertIdentity(txs), {
    tokensHeld: 14,
    tokensCharged: 10,
    tokensRefunded: 4,
  });
}

// Full charge, no refund
{
  const rsvpId = "evt_user3";
  const txs = [hold(rsvpId, 1, 14)];
  assert.deepEqual(assertIdentity(txs), {
    tokensHeld: 14,
    tokensCharged: 14,
    tokensRefunded: 0,
  });
}

// Hold increase on latest gen
{
  const rsvpId = "evt_user4";
  const txs: WeeklyLedgerTxInput[] = [
    hold(rsvpId, 1, 10),
    cancelRefund(rsvpId, 1, 10),
    hold(rsvpId, 2, 10),
    {
      type: "DEBIT",
      amount: 4,
      reason: "rsvp_hold",
      description: "Extra hold",
      idempotencyKey: `rsvp_hold_increase_${rsvpId}_g2`,
    },
  ];
  assert.deepEqual(assertIdentity(txs), {
    tokensHeld: 14,
    tokensCharged: 14,
    tokensRefunded: 0,
  });
}

// Fallback when no txs
assert.deepEqual(assertIdentity([], 20), {
  tokensHeld: 20,
  tokensCharged: 0,
  tokensRefunded: 20,
});

// Event-level identity: 20× held 14 with 8 cancelled + 12 charged → 280 − 112 = 168
{
  const members = [
    ...Array.from({ length: 8 }, (_, i) =>
      memberTokenTotals([hold(`c${i}`, 1, 14), cancelRefund(`c${i}`, 1, 14)])
    ),
    ...Array.from({ length: 12 }, (_, i) => memberTokenTotals([hold(`a${i}`, 1, 14)])),
  ];
  const held = members.reduce((s, m) => s + m.tokensHeld, 0);
  const refunded = members.reduce((s, m) => s + m.tokensRefunded, 0);
  const collected = members.reduce((s, m) => s + m.tokensCharged, 0);
  assert.equal(held, 280);
  assert.equal(refunded, 112);
  assert.equal(collected, 168);
  assert.equal(held - refunded, collected);
}

console.log("weekly-event-ledger memberTokenTotals: all assertions passed");
