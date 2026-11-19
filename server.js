
const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const HORDE = "https://aihorde.net/api/v2";

const SYSTEM_PROMPT = `
Sen UzStudy AI nomli o'zbek tilidagi aqlli yordamchisan.
Savollarga tabiiy, tushunarli va qiziqarli javob ber.
Murakkab mavzularni oddiy misollar bilan tushuntir.
Keraksiz markdown belgilarini ko'paytirma.
Mos joylarda emoji ishlat.
`;

app.get("/api/status", (req, res) => {
    res.json({
        name: "UzStudy AI",
        status: "online",
        aiConfigured: Boolean(process.env.GROQ_API_KEY),
        imageConfigured: Boolean(process.env.HORDE_API_KEY)
    });
});

// AI CHAT
app.post("/api/chat", async (req, res) => {
    try {
        const message = String(req.body.message || "").trim();

        if (!message) {
            return res.status(400).json({
                error: "Savolingizni yozing."
            });
        }

        if (!process.env.GROQ_API_KEY) {
            return res.status(503).json({
                error: "Groq API kaliti sozlanmagan."
            });
        }

        const history = Array.isArray(req.body.history)
            ? req.body.history
            : [];

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history
                .filter(item =>
                    ["user", "assistant"].includes(item.role) &&
                    typeof item.content === "string"
                )
                .slice(-12)
                .map(item => ({
                    role: item.role,
                    content: item.content.slice(0, 4000)
                })),
            { role: "user", content: message }
        ];

        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages,
                    temperature: 0.7,
                    max_completion_tokens: 1500
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Groq:", data);
            return res.status(502).json({
                error: "AI xizmatida xatolik yuz berdi."
            });
        }

        res.json({
            reply: data.choices?.[0]?.message?.content || "Javob olinmadi."
        });

    } catch (error) {
        console.error("Chat xatosi:", error.message);
        res.status(500).json({
            error: "Serverda xatolik yuz berdi."
        });
    }
});

// RASM YARATISH
app.post("/api/image", async (req, res) => {
    try {
        const prompt = String(req.body.prompt || "").trim();

        if (!prompt) {
            return res.status(400).json({
                error: "Rasm tavsifini yozing."
            });
        }

        if (!process.env.HORDE_API_KEY) {
            return res.status(503).json({
                error: "Rasm yaratish API kaliti sozlanmagan."
            });
        }

        const response = await fetch(
            `${HORDE}/generate/async`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": process.env.HORDE_API_KEY,
                    "Client-Agent": "UzStudyAI:1.0"
                },
                body: JSON.stringify({
                    prompt,
                    params: {
                        width: 512,
                        height: 512,
                        steps: 20,
                        n: 1
                    },
                    nsfw: false,
                    censor_nsfw: true
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.id) {
            console.error("Horde:", data);
            return res.status(502).json({
                error: "Rasm so'rovi qabul qilinmadi."
            });
        }

        res.json({
            jobId: data.id,
            message: "Rasm yaratish navbatga qo'yildi."
        });

    } catch (error) {
        console.error("Rasm xatosi:", error.message);
        res.status(500).json({
            error: "Rasm yaratishda xatolik yuz berdi."
        });
    }
});

// RASM HOLATINI TEKSHIRISH
app.get("/api/image/:id", async (req, res) => {
    try {
        const id = req.params.id;

        if (!/^[a-zA-Z0-9-]{10,100}$/.test(id)) {
            return res.status(400).json({
                error: "Rasm ID noto'g'ri."
            });
        }

        const checkResponse = await fetch(
            `${HORDE}/generate/check/${encodeURIComponent(id)}`
        );

        const check = await checkResponse.json();

        if (!checkResponse.ok) {
            throw new Error("Rasm holatini tekshirib bo'lmadi.");
        }

        if (!check.done) {
            return res.json({
                done: false,
                wait: check.wait_time || 5
            });
        }

        const statusResponse = await fetch(
            `${HORDE}/generate/status/${encodeURIComponent(id)}`
        );

        const status = await statusResponse.json();

        if (!statusResponse.ok || !status.generations?.length) {
            throw new Error("Tayyor rasm topilmadi.");
        }

        const generated = status.generations[0];

        res.json({
            done: true,
            image: generated.img
        });

    } catch (error) {
        console.error("Rasm holati:", error.message);
        res.status(500).json({
            error: "Rasmni olishda xatolik yuz berdi."
        });
    }
});

// SERVER
app.listen(PORT, "0.0.0.0", () => {
    console.log(`UzStudy AI server ishlayapti: ${PORT}`);
});
