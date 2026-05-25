const OpenAI = require("openai")
const PDFDocument = require("pdfkit")

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY
})

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription
}) {

    const prompt = `
You are an expert AI interview coach.

Analyze the candidate profile and generate a professional interview preparation report.

Return ONLY valid JSON.

JSON Structure:
{
  "title": "",
  "matchScore": 0,
  "technicalQuestions": [],
  "behavioralQuestions": [],
  "skillGaps": [],
  "preparationPlan": []
}

Requirements:

1. Generate professional job title

2. Match score between 0-100

3. Generate 5 technical interview questions:
- question
- intention
- modelAnswer

4. Generate 5 behavioral interview questions:
- question
- intention
- modelAnswer

5. Generate 5 realistic skill gaps

6. Generate 3-day preparation roadmap:
- day
- title
- topics

Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}
`

    const models = [
        "google/gemma-2-9b-it:free",
        "mistralai/mistral-7b-instruct:free"
    ]

    let completion = null
    let lastError = null

    for (const model of models) {

        try {

            completion = await Promise.race([

                client.chat.completions.create({
                    model,
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    response_format: {
                        type: "json_object"
                    }
                }),

                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 25000)
                )

            ])

            console.log("Using model:", model)

            break

        } catch (error) {

            console.log("Model failed:", model)
            console.log(error.message)

            lastError = error
        }
    }

    if (!completion) {
        throw lastError
    }

    const response = completion.choices[0].message.content

    const parsedData = JSON.parse(response)

    return {
        title: parsedData.title || "Software Developer",
        matchScore: parsedData.matchScore || 75,
        technicalQuestions: parsedData.technicalQuestions || [],
        behavioralQuestions: parsedData.behavioralQuestions || [],
        skillGaps: parsedData.skillGaps || [],
        preparationPlan: parsedData.preparationPlan || []
    }
}

async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription
}) {

    return new Promise((resolve, reject) => {

        const doc = new PDFDocument()

        const buffers = []

        doc.on("data", buffers.push.bind(buffers))

        doc.on("end", () => {

            const pdfData = Buffer.concat(buffers)

            resolve(pdfData)
        })

        doc.fontSize(24).text("AI Optimized Resume", {
            align: "center"
        })

        doc.moveDown()

        doc.fontSize(18).text("Professional Summary")

        doc.moveDown()

        doc.fontSize(12).text(selfDescription || "No self description provided")

        doc.moveDown()

        doc.fontSize(18).text("Resume Content")

        doc.moveDown()

        doc.fontSize(12).text(resume || "No resume content")

        doc.moveDown()

        doc.fontSize(18).text("Target Job Description")

        doc.moveDown()

        doc.fontSize(12).text(jobDescription || "No job description")

        doc.end()
    })
}

module.exports = {
    generateInterviewReport,
    generateResumePdf
}