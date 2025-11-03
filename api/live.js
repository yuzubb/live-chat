const express = require('express');
const { LiveChat } = require('youtube-chat');

const app = express();

app.get('/live/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    
    // videoIdが提供されているかチェック
    if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
    }

    try {
        const liveChat = new LiveChat({ liveId: videoId });
        const collectedChats = [];
        let isStarted = false;

        // チャット受信時の処理
        liveChat.on('chat', (chatItem) => {
            // シンプルなチャットデータを収集
            collectedChats.push({
                author: chatItem.author.name,
                message: chatItem.message.map(m => m.text || m.emojiText).join('')
            });
        });

        // エラーハンドリング
        liveChat.on('error', (err) => {
            console.error(`LiveChat error for ${videoId}:`, err);
            // エラーが発生した場合も収集を停止
            if (isStarted) {
                liveChat.stop();
            }
            // エラーをクライアントに返す処理は複雑になるため、ここでは省略
            // Vercelの制限により、エラーで止まる可能性があるため、本番利用には向かない
        });

        // チャットの監視を開始
        isStarted = await liveChat.start();
        
        if (!isStarted) {
            console.log(`Failed to start chat for ${videoId}.`);
            return res.status(500).json({ error: 'Failed to start live chat observation. Check if the video is live.' });
        }

        // Vercelの実行時間制限を考慮し、**10秒間**だけチャットを収集
        // 実際にはVercelのタイムアウトはもっと短い（10秒〜60秒）可能性があり、不安定
        await new Promise(resolve => setTimeout(resolve, 10000)); 
        
        // 監視を停止し、リソースを解放
        liveChat.stop();

        // 結果をJSON形式でクライアントに返却
        res.status(200).json({
            videoId: videoId,
            chats: collectedChats,
            note: "Vercel's serverless function limited the chat collection to 10 seconds for stability."
        });

    } catch (error) {
        console.error('General error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// VercelのServerless Functionとしてエクスポート
module.exports = app;
