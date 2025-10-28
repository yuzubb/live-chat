const express = require('express');
const { LiveChat } = require("youtube-chat");

const app = express();
const PORT = process.env.PORT || 3000; 

app.get('/get/:id', async (req, res) => {
    const id = req.params.id;

    if (!id) {
        return res.status(400).json({ error: "Live ID or Channel ID is required in the path (e.g., /get/XXXXXXXXX or /get/UCXXXXXXXX)" });
    }

    // IDの形式を判別し、LiveChatインスタンスを生成
    let liveChat;
    if (id.startsWith('UC') && id.length >= 24) {
        // Channel IDとして扱う (現在アクティブなライブを自動で検索)
        liveChat = new LiveChat({ channelId: id });
    } else {
        // Live ID (動画ID) として扱う
        liveChat = new LiveChat({ liveId: id });
    }

    const collectedMessages = [];
    let isFinished = false;

    // 15秒で強制的にタイムアウトさせる（サーバーレス関数の制限対策）
    const timeout = setTimeout(() => {
        if (!isFinished) {
            liveChat.stop();
            res.status(200).json({ 
                id: id, 
                status: "Completed (Time Limit)",
                messages: collectedMessages
            });
            isFinished = true;
        }
    }, 15000);

    liveChat.on("chat", (chatItem) => {
        if (isFinished) return;
        collectedMessages.push({
            author: chatItem.author.name,
            message: chatItem.message.map(msg => msg.text).join(""),
            timestamp: chatItem.timestamp
        });
    });

    liveChat.on("end", (reason) => {
        clearTimeout(timeout);
        if (!isFinished) {
            res.status(200).json({ 
                id: id, 
                status: "Completed",
                messages: collectedMessages
            });
            isFinished = true;
        }
    });

    liveChat.on("error", (err) => {
        clearTimeout(timeout);
        if (!isFinished) {
            let errorDetail = err.message || "Unknown error";
            // エラーメッセージをより分かりやすく調整
            if (errorDetail.includes("Live Stream was not found")) {
                 errorDetail = "Live Stream was not found or is not active/available for chat fetching.";
            }

            res.status(500).json({ 
                error: "Failed to fetch live chat.", 
                details: errorDetail
            });
            isFinished = true;
        }
    });

    try {
        const ok = await liveChat.start();
        if (!ok) {
             clearTimeout(timeout);
            if (!isFinished) {
                res.status(404).json({ 
                    error: "Failed to start live chat observation.",
                    details: "Live stream not found, invalid ID, or package failed to locate it.",
                    id: id
                });
                isFinished = true;
            }
        }
    } catch (error) {
        clearTimeout(timeout);
        if (!isFinished) {
            res.status(500).json({ error: "An unexpected error occurred during start." });
            isFinished = true;
        }
    }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {});
}
