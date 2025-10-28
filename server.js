const express = require('express');
const { LiveChat } = require("youtube-chat");

const app = express();
const PORT = process.env.PORT || 3000; 

// /get/:id エンドポイント：Live ID または Channel ID でアクセス可能
app.get('/get/:id', async (req, res) => {
    const id = req.params.id;

    if (!id) {
        return res.status(400).json({ error: "ID is required (Live ID or Channel ID)." });
    }

    let liveChat;
    if (id.startsWith('UC') && id.length >= 24) {
        // Channel IDとしてインスタンス生成 (現在アクティブなライブを自動検索)
        liveChat = new LiveChat({ channelId: id });
    } else {
        // Live ID (動画ID) としてインスタンス生成
        liveChat = new LiveChat({ liveId: id });
    }

    const collectedMessages = [];
    let isFinished = false;

    // サーバーレス環境でのタイムアウト処理 (最大15秒で強制終了し、結果を返却)
    const timeoutDuration = 15000;
    const timeout = setTimeout(() => {
        if (!isFinished) {
            liveChat.stop();
            // タイムアウト時に正常系のステータスで結果を返却
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
        // 監視開始のログ (Vercelのログで確認可能)
        console.log(`[${id}] Observation started. Target Live ID: ${liveId}`);
    });

    liveChat.on("chat", (chatItem) => {
        if (isFinished) return;
        collectedMessages.push({
            author: chatItem.author.name,
            message: chatItem.message.map(msg => msg.text || (msg.emojiText)).join(""), // 絵文字対応を強化
            isSuperchat: !!chatItem.superchat,
            timestamp: chatItem.timestamp
        });
    });

    liveChat.on("end", (reason) => {
        clearTimeout(timeout);
        if (!isFinished) {
            // 正常終了またはYouTube側からの通知による終了
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
            // エラーの詳細を出力し、クライアントにエラーを返却
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
                // start()がfalseを返した場合 (開始失敗)
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
            // 予期せぬ起動時の例外
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
