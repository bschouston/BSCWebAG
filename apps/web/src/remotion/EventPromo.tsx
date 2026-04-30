import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import React from "react";

export interface EventPromoProps {
    title: string;
    date: string;
    imageUrl?: string;
    sportName: string;
    location: string;
}

export const EventPromo: React.FC<EventPromoProps> = ({
    title,
    date,
    imageUrl,
    sportName,
    location,
}) => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    // Animations
    const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
    const scale = interpolate(frame, [0, 100], [1.1, 1], { extrapolateRight: "clamp" });

    const textSlide = spring({
        frame: frame - 15,
        fps,
        config: { damping: 200 }
    });

    const bgImage = imageUrl || "/images/placeholder-sport.jpg";

    return (
        <AbsoluteFill style={{ backgroundColor: "black" }}>
            {/* Background Image with Slow Zoom */}
            <AbsoluteFill style={{ transform: `scale(${scale})` }}>
                <Img
                    src={bgImage}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: 0.6
                    }}
                />
            </AbsoluteFill>

            {/* Content Layer */}
            <AbsoluteFill style={{
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "column",
                gap: "20px"
            }}>
                {/* Sport Badge */}
                <div style={{
                    opacity,
                    transform: `translateY(${interpolate(frame, [0, 30], [20, 0], { extrapolateRight: "clamp" })}px)`,
                    backgroundColor: "#e11d48", // Primary Red
                    color: "white",
                    padding: "8px 16px",
                    borderRadius: "20px",
                    fontSize: "24px",
                    fontWeight: "bold",
                    textTransform: "uppercase"
                }}>
                    {sportName}
                </div>

                {/* Title */}
                <h1 style={{
                    color: "white",
                    fontSize: "80px",
                    fontWeight: 900,
                    textAlign: "center",
                    lineHeight: 1.1,
                    maxWidth: "80%",
                    margin: 0,
                    opacity: textSlide,
                    transform: `translateY(${interpolate(textSlide, [0, 1], [50, 0])}px)`
                }}>
                    {title}
                </h1>

                {/* Date & Location */}
                <div style={{
                    opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" }),
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px"
                }}>
                    <h2 style={{ color: "white", fontSize: "40px", margin: 0 }}>
                        📅 {date}
                    </h2>
                    <h3 style={{ color: "white", fontSize: "30px", margin: 0, fontWeight: "normal" }}>
                        📍 {location}
                    </h3>
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};
