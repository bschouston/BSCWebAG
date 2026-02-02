"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const SPORTS_LIST = ["Badminton", "Volleyball", "Cricket", "Pickleball", "Table Tennis", "Futsal"];
const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"];

export default function ProfilePage() {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(false);

    // Basic Info
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [photoURL, setPhotoURL] = useState("");

    // Physical
    const [age, setAge] = useState("");
    const [height, setHeight] = useState("");
    const [weight, setWeight] = useState("");

    // ICE
    const [iceName, setIceName] = useState("");
    const [icePhone, setIcePhone] = useState("");
    const [iceRelation, setIceRelation] = useState("");

    // Skills
    const [skills, setSkills] = useState<Record<string, string>>({});

    useEffect(() => {
        if (profile) {
            setFirstName(profile.firstName || "");
            setLastName(profile.lastName || "");
            setPhotoURL(profile.photoURL || "");

            setAge(profile.age?.toString() || "");
            setHeight(profile.height || "");
            setWeight(profile.weight || "");

            setIceName(profile.iceContact?.name || "");
            setIcePhone(profile.iceContact?.phone || "");
            setIceRelation(profile.iceContact?.relation || "");

            setSkills(profile.skillLevels || {});
        }
    }, [profile]);

    const handleUpdateProfile = async () => {
        if (!user || !profile) return;
        setLoading(true);

        try {
            await updateDoc(doc(db, "users", user.uid), {
                firstName,
                lastName,
                photoURL,
                age: age ? parseInt(age) : null,
                height,
                weight,
                iceContact: {
                    name: iceName,
                    phone: icePhone,
                    relation: iceRelation
                },
                skillLevels: skills,
                updatedAt: new Date()
            });
            alert("Profile updated successfully");
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const handleSkillChange = (sport: string, level: string) => {
        setSkills(prev => ({
            ...prev,
            [sport]: level
        }));
    };

    if (!profile || !user) {
        return <div className="p-8">Loading profile...</div>;
    }

    const initials = (firstName[0] || "") + (lastName[0] || "");

    return (
        <div className="container max-w-3xl py-8 space-y-8">
            <h1 className="text-3xl font-bold">My Profile</h1>

            {/* Profile Summary Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Account Details</CardTitle>
                    <CardDescription>Manage your personal information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">

                    {/* Public Profile */}
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div className="flex flex-col items-center gap-4">
                            <Avatar className="h-24 w-24">
                                <AvatarImage src={photoURL || ""} />
                                <AvatarFallback className="text-xl">{initials.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-2 w-full">
                                <Label htmlFor="photoURL" className="text-xs">Profile Image URL</Label>
                                <Input
                                    id="photoURL"
                                    value={photoURL}
                                    onChange={(e) => setPhotoURL(e.target.value)}
                                    placeholder="https://..."
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex-1 space-y-4 w-full">
                            <div>
                                <p className="text-lg font-medium">{user.email}</p>
                                <div className="flex gap-2 mt-1">
                                    <Badge variant="outline">{profile.role}</Badge>
                                    <Badge variant="secondary">{profile.tokenBalance} Tokens</Badge>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="firstName">First Name</Label>
                                    <Input
                                        id="firstName"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lastName">Last Name</Label>
                                    <Input
                                        id="lastName"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Physical Attributes */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Physical Attributes</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="age">Age</Label>
                                <Input
                                    id="age"
                                    type="number"
                                    value={age}
                                    onChange={(e) => setAge(e.target.value)}
                                    placeholder="25"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="height">Height</Label>
                                <Input
                                    id="height"
                                    value={height}
                                    onChange={(e) => setHeight(e.target.value)}
                                    placeholder="5'10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="weight">Weight</Label>
                                <Input
                                    id="weight"
                                    value={weight}
                                    onChange={(e) => setWeight(e.target.value)}
                                    placeholder="170 lbs"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Emergency Contact */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Emergency Contact (ICE)</h3>
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="iceName">Name</Label>
                                <Input
                                    id="iceName"
                                    value={iceName}
                                    onChange={(e) => setIceName(e.target.value)}
                                    placeholder="Emergency Contact Name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="icePhone">Phone</Label>
                                <Input
                                    id="icePhone"
                                    value={icePhone}
                                    onChange={(e) => setIcePhone(e.target.value)}
                                    placeholder="(555) 123-4567"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="iceRelation">Relation</Label>
                                <Input
                                    id="iceRelation"
                                    value={iceRelation}
                                    onChange={(e) => setIceRelation(e.target.value)}
                                    placeholder="Sibling, Parent, etc."
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Skills */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Sports Skills</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                            {SPORTS_LIST.map((sport) => (
                                <div key={sport} className="flex items-center justify-between p-3 border rounded-lg">
                                    <Label className="font-medium">{sport}</Label>
                                    <Select
                                        value={skills[sport] || ""}
                                        onValueChange={(val) => handleSkillChange(sport, val)}
                                    >
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder="Select Level" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SKILL_LEVELS.map(level => (
                                                <SelectItem key={level} value={level}>{level}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button onClick={handleUpdateProfile} disabled={loading} size="lg">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save All Changes
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
