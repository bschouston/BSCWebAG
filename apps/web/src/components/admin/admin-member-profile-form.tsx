"use client";

import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PLAYER_SPORT_IDS,
  PLAYER_SPORT_LABELS,
  PLAYER_SKILL_LEVELS,
  PLAYER_SKILL_LABELS,
  PLAYER_GENDERS,
  PLAYER_GENDER_LABELS,
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  emptyPlayerProfile,
  feetInchesToTotal,
  inchesToFeetInches,
  isUnitedStatesCountry,
  normalizeAndValidateMemberProfile,
  resolveCountry,
  tryNormalizePhoneE164,
  validateHeightInputs,
  validateWeightLbs,
  type PlayerGender,
  type PlayerSkillLevel,
  type PlayerSportId,
} from "@/lib/player-profile";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function AdminMemberProfileForm({
  uid,
  authUser,
}: {
  uid: string;
  authUser: User;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<PlayerGender | "">("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [sports, setSports] = useState<
    Record<string, { preferred: boolean; skillLevel?: PlayerSkillLevel | null }>
  >({});
  const [iceName, setIceName] = useState("");
  const [icePhone, setIcePhone] = useState("");
  const [iceRelation, setIceRelation] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await authUser.getIdToken();
        const res = await fetch(`/api/admin/users/${uid}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load profile");
        if (cancelled) return;
        setPhone(data.phone || data.playerProfile?.phone || "");
        const pp = data.playerProfile || emptyPlayerProfile();
        setLine1(pp.address?.line1 || "");
        setLine2(pp.address?.line2 || "");
        setCity(pp.address?.city || "");
        setState(pp.address?.state || "");
        setPostalCode(pp.address?.postalCode || "");
        setCountry(resolveCountry(pp.address?.country));
        setDateOfBirth(pp.dateOfBirth || "");
        setGender(pp.gender || "");
        const hi = inchesToFeetInches(pp.heightInches);
        setHeightFeet(hi.feet);
        setHeightInches(hi.inches);
        setWeightLbs(
          pp.weightLbs != null && Number.isFinite(pp.weightLbs) ? String(pp.weightLbs) : ""
        );
        setSports(pp.sports || {});
        setIceName(pp.iceContact?.name || "");
        setIcePhone(pp.iceContact?.phone || "");
        setIceRelation(pp.iceContact?.relation || "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, uid]);

  const heightTotal = feetInchesToTotal(heightFeet, heightInches);
  const weightNum = weightLbs.trim() === "" ? null : Number(weightLbs);
  const isUS = isUnitedStatesCountry(country);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    const preErrors: Record<string, string> = {};
    const heightErr = validateHeightInputs(heightFeet, heightInches);
    if (heightErr) preErrors.heightInches = heightErr;
    const weightErr = validateWeightLbs(weightLbs);
    if (weightErr) preErrors.weightLbs = weightErr;
    if (Object.keys(preErrors).length > 0) {
      setFieldErrors(preErrors);
      setError(Object.values(preErrors)[0]);
      setSaving(false);
      return;
    }

    const payload = {
      phone,
      playerProfile: {
        version: 1 as const,
        phone,
        address: {
          line1,
          line2: line2 || null,
          city,
          state,
          postalCode,
          country: resolveCountry(country),
        },
        dateOfBirth: dateOfBirth.trim() || null,
        gender: gender || null,
        heightInches: heightFeet.trim() || heightInches.trim() ? heightTotal : null,
        weightLbs:
          weightLbs.trim() === "" ? null : Number.isFinite(weightNum) ? weightNum : null,
        photoPath: null,
        sports,
        iceContact: { name: iceName, phone: icePhone, relation: iceRelation },
      },
    };

    const validated = normalizeAndValidateMemberProfile(payload);
    if (!validated.ok) {
      setFieldErrors(validated.fieldErrors);
      setError(validated.error);
      setSaving(false);
      return;
    }

    try {
      const token = await authUser.getIdToken();
      const res = await fetch(`/api/admin/users/${uid}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validated.data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.fieldErrors && typeof body.fieldErrors === "object") {
          setFieldErrors(body.fieldErrors);
        }
        throw new Error(body.error || "Failed to save profile");
      }
      setSuccess("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading profile…</p>;

  return (
    <div className="max-w-2xl min-w-0 space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Phone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              if (!phone.trim()) return;
              const result = tryNormalizePhoneE164(phone, country);
              if (result.ok) setPhone(result.value ?? "");
            }}
          />
          <FieldError message={fieldErrors.phone} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Address line 1</Label>
          <Input value={line1} onChange={(e) => setLine1(e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Address line 2</Label>
          <Input value={line2} onChange={(e) => setLine2(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{isUS ? "State" : "Region"}</Label>
          <Input value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Postal code</Label>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Date of birth</Label>
          <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select value={gender || "__none"} onValueChange={(v) => setGender(v === "__none" ? "" : (v as PlayerGender))}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Not set</SelectItem>
              {PLAYER_GENDERS.map((g) => (
                <SelectItem key={g} value={g}>
                  {PLAYER_GENDER_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Height (ft)</Label>
          <Input value={heightFeet} onChange={(e) => setHeightFeet(e.target.value)} />
          <FieldError message={fieldErrors.heightInches} />
        </div>
        <div className="space-y-2">
          <Label>Height (in)</Label>
          <Input value={heightInches} onChange={(e) => setHeightInches(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Weight (lbs)</Label>
          <Input value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} />
          <FieldError message={fieldErrors.weightLbs} />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Sports</Label>
        {PLAYER_SPORT_IDS.map((sportId: PlayerSportId) => (
          <div key={sportId} className="flex flex-wrap items-center gap-3">
            <Checkbox
              checked={Boolean(sports[sportId]?.preferred)}
              onCheckedChange={(v) =>
                setSports((prev) => ({
                  ...prev,
                  [sportId]: {
                    preferred: Boolean(v),
                    skillLevel: prev[sportId]?.skillLevel ?? null,
                  },
                }))
              }
            />
            <span className="min-w-0 flex-1 text-sm sm:w-44 sm:flex-none">{PLAYER_SPORT_LABELS[sportId]}</span>
            <Select
              value={sports[sportId]?.skillLevel || "__none"}
              onValueChange={(v) =>
                setSports((prev) => ({
                  ...prev,
                  [sportId]: {
                    preferred: prev[sportId]?.preferred ?? Boolean(v !== "__none"),
                    skillLevel: v === "__none" ? null : (v as PlayerSkillLevel),
                  },
                }))
              }
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Skill" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {PLAYER_SKILL_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {PLAYER_SKILL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>ICE name</Label>
          <Input value={iceName} onChange={(e) => setIceName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>ICE phone</Label>
          <Input value={icePhone} onChange={(e) => setIcePhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>ICE relation</Label>
          <Input value={iceRelation} onChange={(e) => setIceRelation(e.target.value)} />
        </div>
      </div>

      <Button className="w-full sm:w-auto" onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
