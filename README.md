# Guitar Guider 🎸

מורה פרטי לגיטרה: שולחים שיר (קובץ או קישור יוטיוב), והאפליקציה מנתחת אותו ומלמדת איך לנגן אותו:
אקורדים עם דיאגרמות אצבעות, קצב ופעמות, מבנה השיר, לופ על קטעים והאטה בלי שינוי גובה הצליל.

## הפעלה (Windows)

דרישות: [Node.js](https://nodejs.org), [ffmpeg](https://ffmpeg.org), [uv](https://docs.astral.sh/uv/)

```powershell
winget install OpenJS.NodeJS.LTS Gyan.FFmpeg astral-sh.uv
.\start.ps1
```

האפליקציה נפתחת בכתובת http://localhost:8000.

## פריסה לשרת (Railway או כל שירות שתומך ב-Docker)

הפרויקט נבנה מה-`Dockerfile` שבתיקייה הראשית. משתני סביבה:

| משתנה | למה |
|---|---|
| `GG_PASSWORD` | סיסמה לאתר (שם המשתמש לא משנה). **חובה** אם האתר ציבורי |
| `GG_DATA_DIR` | איפה לשמור שירים. ברירת המחדל `/data`. ב-Railway יש לחבר Volume לנתיב הזה, אחרת השירים נמחקים בכל פריסה |

## מבנה

| תיקייה | מה יש בה |
|---|---|
| `backend/` | שרת Python (FastAPI): הורדה (yt-dlp), הפרדת ערוצים (Demucs), ניתוח (librosa): פעמות, משקל, סולם, אקורדים ומבנה |
| `frontend/` | אפליקציית Web (React + Vite + Tailwind), בעברית ומותאמת למובייל |

לפיתוח: `uv run guitar-guider-backend` בתוך `backend/`, ו-`npm run dev` בתוך `frontend/`.

השירים והניתוחים נשמרים מקומית ב-`backend/data/` ולא עולים לריפו.
