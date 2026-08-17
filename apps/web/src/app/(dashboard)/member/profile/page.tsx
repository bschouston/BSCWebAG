"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import {
  PLAYER_SPORT_IDS,
  PLAYER_SPORT_LABELS,
  PLAYER_SKILL_LEVELS,
  PLAYER_SKILL_LABELS,
  PLAYER_GENDERS,
  PLAYER_GENDER_LABELS,
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  ageFromDob,
  bmiFromHeightWeight,
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
import { memberAreaTitle, memberFullName } from "@/lib/member-name";
import { MemberPageHeader } from "@/components/dashboard/member-page-header";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export default function ProfilePage() {
  const { user, profile: authProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [tokenBalance, setTokenBalance] = useState(0);
  const [itsNumber, setItsNumber] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
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
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/member/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load profile");
        }
        const data = await res.json();
        if (cancelled) return;

        setEmail(data.email || user.email || "");
        setRole(data.role || "MEMBER");
        setTokenBalance(
          typeof data.tokenBalance === "number" ? data.tokenBalance : 0
        );
        setItsNumber(
          typeof data.itsNumber === "string" && data.itsNumber
            ? data.itsNumber
            : typeof authProfile?.itsNumber === "string" && authProfile.itsNumber
              ? authProfile.itsNumber
              : null
        );
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setPhotoURL(data.photoURL || user.photoURL || "");
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
          pp.weightLbs != null && Number.isFinite(pp.weightLbs)
            ? String(pp.weightLbs)
            : ""
        );

        setSports(pp.sports || {});
        setIceName(pp.iceContact?.name || "");
        setIcePhone(pp.iceContact?.phone || "");
        setIceRelation(pp.iceContact?.relation || "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const derivedAge = ageFromDob(dateOfBirth || null);
  const heightTotal = feetInchesToTotal(heightFeet, heightInches);
  const weightNum =
    weightLbs.trim() === "" ? null : Number(weightLbs);
  const derivedBmi = bmiFromHeightWeight(
    heightTotal,
    weightNum != null && Number.isFinite(weightNum) ? weightNum : null
  );
  const isUS = isUnitedStatesCountry(country);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const blurNormalizePhone = (
    value: string,
    setter: (v: string) => void,
    errorKey: string
  ) => {
    if (!value.trim()) {
      clearFieldError(errorKey);
      return;
    }
    const result = tryNormalizePhoneE164(value, country);
    if (result.ok) {
      setter(result.value ?? "");
      clearFieldError(errorKey);
    } else {
      setFieldErrors((prev) => ({ ...prev, [errorKey]: result.error }));
    }
  };

  const initials =
    (firstName[0] || "") + (lastName[0] || "") ||
    (email[0] || "?").toUpperCase();

  const setSportPreferred = (sportId: PlayerSportId, preferred: boolean) => {
    setSports((prev) => ({
      ...prev,
      [sportId]: {
        preferred,
        skillLevel: prev[sportId]?.skillLevel ?? null,
      },
    }));
  };

  const setSportSkill = (
    sportId: PlayerSportId,
    skillLevel: PlayerSkillLevel | ""
  ) => {
    setSports((prev) => ({
      ...prev,
      [sportId]: {
        preferred: prev[sportId]?.preferred ?? Boolean(skillLevel),
        skillLevel: skillLevel || null,
      },
    }));
  };

  const handleSave = async () => {
    if (!user) return;
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
        heightInches:
          heightFeet.trim() || heightInches.trim() ? heightTotal : null,
        weightLbs:
          weightLbs.trim() === ""
            ? null
            : Number.isFinite(weightNum)
              ? weightNum
              : null,
        photoPath: null,
        sports,
        iceContact: {
          name: iceName,
          phone: icePhone,
          relation: iceRelation,
        },
      },
    };

    const validated = normalizeAndValidateMemberProfile(payload);
    if (!validated.ok) {
      setFieldErrors(validated.fieldErrors);
      setError(validated.error);
      setSaving(false);
      return;
    }

    // Reflect normalized values in the form (names stay Google-owned / read-only)
    setPhone(validated.data.phone ?? "");
    const addr = validated.data.playerProfile.address;
    if (addr) {
      setLine1(addr.line1);
      setLine2(addr.line2 ?? "");
      setCity(addr.city);
      setState(addr.state);
      setPostalCode(addr.postalCode);
      setCountry(resolveCountry(addr.country));
    }
    const ice = validated.data.playerProfile.iceContact;
    if (ice) {
      setIceName(ice.name);
      setIcePhone(ice.phone);
      setIceRelation(ice.relation);
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/profile", {
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
      if (body.phone != null) setPhone(body.phone || "");
      if (body.photoURL != null) setPhotoURL(body.photoURL || "");
      if (body.playerProfile?.address) {
        const a = body.playerProfile.address;
        setLine1(a.line1 || "");
        setLine2(a.line2 || "");
        setCity(a.city || "");
        setState(a.state || "");
        setPostalCode(a.postalCode || "");
        setCountry(resolveCountry(a.country));
      }
      if (body.playerProfile?.iceContact) {
        setIceName(body.playerProfile.iceContact.name || "");
        setIcePhone(body.playerProfile.iceContact.phone || "");
        setIceRelation(body.playerProfile.iceContact.relation || "");
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!user || !authProfile) {
    return <div className="p-8">Loading profile...</div>;
  }

  if (loading) {
    return (
      <div className="container max-w-3xl py-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading profile...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <MemberPageHeader
        title={memberAreaTitle(
          memberFullName({
            firstName: authProfile.firstName || firstName,
            lastName: authProfile.lastName || lastName,
            displayName: user.displayName,
          }),
          "Profile"
        )}
        subtitle="Your player details for Bay Sports Club."
      />

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200"
        >
          {success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Photo &amp; name</CardTitle>
          <CardDescription>
            Account identity from your Google sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex flex-col items-center gap-3">
              <Avatar className="h-24 w-24">
                <AvatarImage src={photoURL || ""} alt="" />
                <AvatarFallback className="text-xl">
                  {initials.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 space-y-4 w-full">
              <div>
                <p className="text-lg font-medium">{email}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant="outline">{role}</Badge>
                  <Badge variant="secondary">{tokenBalance} Tokens</Badge>
                  <Badge variant="outline" className="font-mono">
                    ITS# {itsNumber || "—"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Your ITS# is permanent. Contact a Super Admin if it needs to change.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    readOnly
                    disabled
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    readOnly
                    disabled
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Photo, name, and email come from your Google account.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>Phone and mailing address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                clearFieldError("phone");
              }}
              onBlur={() => blurNormalizePhone(phone, setPhone, "phone")}
              placeholder={isUS ? "5551234567 or +15551234567" : "+441234567890"}
              autoComplete="tel"
              inputMode="tel"
            />
            <FieldError message={fieldErrors.phone} />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Select
              value={resolveCountry(country)}
              onValueChange={(v) => {
                setCountry(v);
                clearFieldError("address.country");
                clearFieldError("address.state");
                clearFieldError("address.postalCode");
                clearFieldError("phone");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors["address.country"]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="line1">Address line 1</Label>
            <Input
              id="line1"
              value={line1}
              onChange={(e) => {
                setLine1(e.target.value);
                clearFieldError("address.line1");
              }}
              autoComplete="address-line1"
              maxLength={120}
            />
            <FieldError message={fieldErrors["address.line1"]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="line2">Address line 2</Label>
            <Input
              id="line2"
              value={line2}
              onChange={(e) => {
                setLine2(e.target.value);
                clearFieldError("address.line2");
              }}
              autoComplete="address-line2"
              maxLength={120}
            />
            <FieldError message={fieldErrors["address.line2"]} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  clearFieldError("address.city");
                }}
                autoComplete="address-level2"
                maxLength={80}
              />
              <FieldError message={fieldErrors["address.city"]} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">{isUS ? "State" : "State / province"}</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  clearFieldError("address.state");
                }}
                placeholder={isUS ? "CA" : ""}
                autoComplete="address-level1"
                maxLength={40}
              />
              <FieldError message={fieldErrors["address.state"]} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">{isUS ? "ZIP code" : "Postal code"}</Label>
            <Input
              id="postalCode"
              value={postalCode}
              onChange={(e) => {
                setPostalCode(e.target.value);
                clearFieldError("address.postalCode");
              }}
              placeholder={isUS ? "12345 or 12345-6789" : ""}
              autoComplete="postal-code"
              maxLength={20}
            />
            <FieldError message={fieldErrors["address.postalCode"]} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal</CardTitle>
          <CardDescription>Age is calculated from date of birth.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => {
                setDateOfBirth(e.target.value);
                clearFieldError("dateOfBirth");
              }}
            />
            <FieldError message={fieldErrors.dateOfBirth} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Age</Label>
            <Input
              id="age"
              value={derivedAge != null ? String(derivedAge) : "—"}
              readOnly
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={gender || "unset"}
              onValueChange={(v) =>
                setGender(v === "unset" ? "" : (v as PlayerGender))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Unset</SelectItem>
                {PLAYER_GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {PLAYER_GENDER_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Physical</CardTitle>
          <CardDescription>BMI is calculated from height and weight.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="feet">Height (ft)</Label>
              <Input
                id="feet"
                inputMode="numeric"
                value={heightFeet}
                onChange={(e) => {
                  setHeightFeet(e.target.value);
                  clearFieldError("heightInches");
                }}
                placeholder="5"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inches">Height (in)</Label>
              <Input
                id="inches"
                inputMode="numeric"
                value={heightInches}
                onChange={(e) => {
                  setHeightInches(e.target.value);
                  clearFieldError("heightInches");
                }}
                placeholder="10"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (lbs)</Label>
              <Input
                id="weight"
                inputMode="decimal"
                value={weightLbs}
                onChange={(e) => {
                  setWeightLbs(e.target.value);
                  clearFieldError("weightLbs");
                }}
                placeholder="170"
                maxLength={5}
              />
              <FieldError message={fieldErrors.weightLbs} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bmi">BMI</Label>
              <Input
                id="bmi"
                value={derivedBmi != null ? String(derivedBmi) : "—"}
                readOnly
                disabled
              />
            </div>
          </div>
          <FieldError message={fieldErrors.heightInches} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sports</CardTitle>
          <CardDescription>
            Mark sports you play and optionally set a skill level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PLAYER_SPORT_IDS.map((sportId) => {
            const entry = sports[sportId];
            const preferred = entry?.preferred === true;
            const skill = entry?.skillLevel || "";
            return (
              <div
                key={sportId}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between py-2 border-b last:border-0"
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={preferred}
                    onCheckedChange={(v) =>
                      setSportPreferred(sportId, v === true)
                    }
                  />
                  <span className="font-medium">
                    {PLAYER_SPORT_LABELS[sportId]}
                  </span>
                </label>
                <Select
                  value={skill || "unset"}
                  onValueChange={(v) =>
                    setSportSkill(
                      sportId,
                      v === "unset" ? "" : (v as PlayerSkillLevel)
                    )
                  }
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Skill level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">No level set</SelectItem>
                    {PLAYER_SKILL_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {PLAYER_SKILL_LABELS[level]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency contact (ICE)</CardTitle>
          <CardDescription>
            Who to contact in an emergency during events.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="iceName">Name</Label>
            <Input
              id="iceName"
              value={iceName}
              onChange={(e) => {
                setIceName(e.target.value);
                clearFieldError("iceName");
              }}
              maxLength={80}
            />
            <FieldError message={fieldErrors.iceName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="icePhone">Phone</Label>
            <Input
              id="icePhone"
              value={icePhone}
              onChange={(e) => {
                setIcePhone(e.target.value);
                clearFieldError("icePhone");
              }}
              onBlur={() => blurNormalizePhone(icePhone, setIcePhone, "icePhone")}
              inputMode="tel"
            />
            <FieldError message={fieldErrors.icePhone} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iceRelation">Relation</Label>
            <Input
              id="iceRelation"
              value={iceRelation}
              onChange={(e) => {
                setIceRelation(e.target.value);
                clearFieldError("iceRelation");
              }}
              placeholder="Parent, sibling, …"
              maxLength={40}
            />
            <FieldError message={fieldErrors.iceRelation} />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save profile
        </Button>
      </div>
    </div>
  );
}
