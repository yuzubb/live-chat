const express = require('express');
const { LiveChat } = require("youtube-chat");

const app = express();
const PORT = process.env.PORT || 3000; 

app.get('/get/:id', async (req, res) => {
    const id = req.params.id;

    if (!id) {
        return res.status(400).json({ error: "ID is required (Live ID or Channel ID)." });
    }

    let liveChat;
    if (id.startsWith('UC') && id.length >= 24) {
        // Channel IDとしてインスタンス生成
        liveChat = new LiveChat({ channelId: id });
    } else {
        // Live ID (動画ID) としてインスタンス生成
        liveChat = new LiveChat({ liveId: id });
    }

    const collectedMessages = [];
    let isFinished = false;

    // 応答速度向上のため、タイムアウトを5秒に設定
    const timeoutDuration = 10000; 
    const timeout = setTimeout(() => {
        if (!isFinished) {
            liveChat.stop();
            res.status(200).json({ 
                id: id, 
                status: `Completed (Time Limit: ${timeoutDuration / 1000}s)`,
                messages: collectedMessages,
                note: "Serverless function timed out after collecting messages."
            });
            isFinished = true;
        }
    }, timeoutDuration);

    // --- LiveChat イベントリスナー ---

    liveChat.on("start", (liveId) => {
        console.log(`[${id}] Observation started. Target Live ID: ${liveId}`);
    });

    liveChat.on("chat", (chatItem) => {
        if (isFinished) return;
        // chatItem の全構造をそのまま保存
        collectedMessages.push(chatItem);
    });

    liveChat.on("end", (reason) => {
        clearTimeout(timeout);
        if (!isFinished) {
            res.status(200).json({ 
                id: id, 
                status: "Completed (Observation End)",
                messages: collectedMessages,
                reason: reason || "Live chat ended normally."
            });
            isFinished = true;
        }
    });

    liveChat.on("error", (err) => {
        clearTimeout(timeout);
        if (!isFinished) {
            console.error(`[${id}] ERROR occurred:`, err); 
            
            let errorDetail = err.message || "Unknown error";
            if (errorDetail.includes("Live Stream was not found")) {
                 errorDetail = "Live Stream was not found or is not active/available for chat fetching. Ensure the live is currently running.";
            }

            res.status(500).json({ 
                error: "Failed to fetch live chat.", 
                details: errorDetail
            });
            isFinished = true;
        }
    });

    // --- 監視開始 ---
    try {
        const ok = await liveChat.start();
        if (!ok) {
             clearTimeout(timeout);
            if (!isFinished) {
                res.status(404).json({ 
                    error: "Observation Start Failed.",
                    details: "The live stream could not be started. Check if the ID is valid and the stream is truly live.",
                    id: id
                });
                isFinished = true;
            }
        }
    } catch (error) {
        clearTimeout(timeout);
        if (!isFinished) {
            console.error(`[${id}] UNEXPECTED START ERROR:`, error);
            res.status(500).json({ error: "An unexpected error occurred during start." });
            isFinished = true;
        }
    }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}
