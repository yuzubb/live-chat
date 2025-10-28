const express = require('express');
const { LiveChat } = require("youtube-chat");

const app = express();
const PORT = process.env.PORT || 3000; 

app.get('/get/:liveid', async (req, res) => {
    const liveId = req.params.liveid;

    if (!liveId) {
        return res.status(400).json({ error: "Live ID is required in the path (e.g., /get/XXXXXXXXX)" });
    }

    const liveChat = new LiveChat({ liveId: liveId });
    const collectedMessages = [];
    let isFinished = false;

    const timeout = setTimeout(() => {
        if (!isFinished) {
            liveChat.stop();
            res.status(200).json({ 
                liveId: liveId, 
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
                liveId: liveId, 
                status: "Completed",
                messages: collectedMessages
            });
            isFinished = true;
        }
    });

    liveChat.on("error", (err) => {
        clearTimeout(timeout);
        if (!isFinished) {
            res.status(500).json({ error: "Failed to fetch live chat.", details: err.message });
            isFinished = true;
        }
    });

    try {
        const ok = await liveChat.start();
        if (!ok) {
             clearTimeout(timeout);
            if (!isFinished) {
                res.status(404).json({ 
                    error: "Failed to start live chat observation. Live stream not found or invalid ID.",
                    liveId: liveId
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
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}
