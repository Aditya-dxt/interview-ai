const Groq = require("groq-sdk")
const { z } = require("zod")
const puppeteer = require("puppeteer")

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
})

/* ---------------- INTERVIEW REPORT SCHEMA ---------------- */

const interviewReportSchema = z.object({
    matchScore: z.number(),
    technicalQuestions: z.array(
        z.object({
            question: z.string(),
            intention: z.string(),
            answer: z.string(),
        })
    ),
    behavioralQuestions: z.array(
        z.object({
            question: z.string(),
            intention: z.string(),
            answer: z.string(),
        })
    ),
    skillGaps: z.array(
        z.object({
            skill: z.string(),
            severity: z.enum(["low", "medium", "high"]),
        })
    ),
    preparationPlan: z.array(
        z.object({
            day: z.number(),
            focus: z.string(),
            tasks: z.array(z.string()),
        })
    ),
    title: z.string(),
})

/* ---------------- GENERATE INTERVIEW REPORT ---------------- */

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription,
}) {

    const prompt = `
You are an expert technical interviewer and career coach.

Analyze this candidate carefully.

Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}

Return ONLY valid JSON in this exact format:

{
  "title": "Frontend Developer",
  "matchScore": 95,
  "technicalQuestions": [
    {
      "question": "",
      "intention": "",
      "answer": ""
    }
  ],
  "behavioralQuestions": [
    {
      "question": "",
      "intention": "",
      "answer": ""
    }
  ],
  "skillGaps": [
    {
      "skill": "",
      "severity": "low"
    }
  ],
  "preparationPlan": [
    {
      "day": 1,
      "focus": "",
      "tasks": [""]
    }
  ]
}

IMPORTANT:
- Response must be ONLY JSON
- Do not wrap in markdown
- Do not skip title
- title is REQUIRED
`

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
        temperature: 0.7,
    })

    const response =
        completion.choices[0].message.content

    const cleanedResponse = response
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()

    return JSON.parse(cleanedResponse)
}

/* ---------------- PDF GENERATION ---------------- */

async function generatePdfFromHtml(htmlContent) {

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
        ],
    })

    const page = await browser.newPage()

    await page.setContent(htmlContent, {
        waitUntil: "networkidle0",
    })

    const pdfBuffer = await page.pdf({
        format: "A4",
        margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm",
        },
    })

    await browser.close()

    return pdfBuffer
}

/* ---------------- GENERATE RESUME PDF ---------------- */

async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription,
}) {

    const prompt = `
Create a professional ATS-friendly resume in clean HTML format.

Candidate Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}

Requirements:
- modern professional design
- ATS friendly
- concise
- realistic human-like writing
- responsive HTML layout
- use proper sections
- highlight relevant skills
- no fake experience

Return ONLY raw HTML.
`

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
        temperature: 0.7,
    })

    const htmlContent =
        completion.choices[0].message.content

    const cleanedHtml = htmlContent
        .replace(/```html/g, "")
        .replace(/```/g, "")
        .trim()

    const pdfBuffer =
        await generatePdfFromHtml(cleanedHtml)

    return pdfBuffer
}

module.exports = {
    generateInterviewReport,
    generateResumePdf,
}