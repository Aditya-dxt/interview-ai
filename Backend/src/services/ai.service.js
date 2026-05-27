const { GoogleGenerativeAI } = require("@google/generative-ai")

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash"
})

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription
}) {

    const prompt = `
You are an expert AI interview coach and senior technical recruiter.

Analyze the candidate profile and generate a COMPLETE professional interview preparation report.

IMPORTANT:
- Return ONLY valid JSON
- No markdown
- No explanation text
- No triple backticks

JSON FORMAT:

{
  "title": "",
  "matchScore": 0,
  "technicalQuestions": [
    {
      "question": "",
      "intention": "",
      "modelAnswer": ""
    }
  ],
  "behavioralQuestions": [
    {
      "question": "",
      "intention": "",
      "modelAnswer": ""
    }
  ],
  "skillGaps": [],
  "preparationPlan": [
    {
      "day": "",
      "title": "",
      "topics": []
    }
  ]
}

REQUIREMENTS:

1. Generate realistic professional job title

2. Generate match score from 0-100

3. Generate 8 HIGH QUALITY technical interview questions:
- role specific
- practical
- detailed model answers

4. Generate 8 behavioral interview questions:
- STAR format style answers
- leadership
- teamwork
- debugging
- ownership
- communication

5. Generate 6 realistic skill gaps

6. Generate DETAILED 7-day roadmap:
- day
- title
- 4-5 preparation topics

Candidate Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}
`

    try {

        const result = await model.generateContent(prompt)

        const response = await result.response

        const text = response.text()

        const cleanedText = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()

        const parsedData = JSON.parse(cleanedText)

        return {
            title: parsedData.title || "Software Developer",
            matchScore: parsedData.matchScore || 75,
            technicalQuestions: parsedData.technicalQuestions || [],
            behavioralQuestions: parsedData.behavioralQuestions || [],
            skillGaps: parsedData.skillGaps || [],
            preparationPlan: parsedData.preparationPlan || []
        }

    } catch (error) {

        console.log("Gemini Error:", error)

        throw new Error("Failed to generate interview report")
    }
}

async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription
}) {

    return new Promise((resolve, reject) => {

        const doc = new PDFDocument({
            margin: 50
        })

        const buffers = []

        doc.on("data", buffers.push.bind(buffers))

        doc.on("end", () => {

            const pdfData = Buffer.concat(buffers)

            resolve(pdfData)
        })

        // HEADER
        doc
            .fontSize(26)
            .fillColor("#2563eb")
            .text("AI Optimized Resume", {
                align: "center"
            })

        doc.moveDown(2)

        // SUMMARY
        doc
            .fontSize(18)
            .fillColor("black")
            .text("Professional Summary")

        doc.moveDown()

        doc
            .fontSize(12)
            .fillColor("#444")
            .text(selfDescription || "No summary provided")

        doc.moveDown(2)

        // RESUME CONTENT
        doc
            .fontSize(18)
            .fillColor("black")
            .text("Resume Content")

        doc.moveDown()

        doc
            .fontSize(12)
            .fillColor("#444")
            .text(resume || "No resume content")

        doc.moveDown(2)

        // JOB DESCRIPTION
        doc
            .fontSize(18)
            .fillColor("black")
            .text("Target Job Description")

        doc.moveDown()

        doc
            .fontSize(12)
            .fillColor("#444")
            .text(jobDescription || "No job description")

        doc.end()
    })
}

module.exports = {
    generateInterviewReport,
    generateResumePdf
}