const OpenAI = require("openai")

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY
})


/**
 * Generate Interview Report
 */
async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription
}) {

    const prompt = `
You are an expert AI interview coach and senior technical recruiter.

Analyze the candidate profile carefully and generate a COMPLETE interview preparation report.

IMPORTANT INSTRUCTIONS:
- Return ONLY valid JSON
- Do NOT add markdown
- Do NOT add explanation text
- Generate realistic and high-quality answers
- Questions should match the job description
- Model answers should be practical and interview-ready
- Roadmap should be detailed and actionable

JSON FORMAT:

{
  "title": "string",
  "matchScore": number,
  "technicalQuestions": [
    {
      "question": "string",
      "intention": "string",
      "modelAnswer": "string"
    }
  ],
  "behavioralQuestions": [
    {
      "question": "string",
      "intention": "string",
      "modelAnswer": "string"
    }
  ],
  "skillGaps": ["string"],
  "preparationPlan": [
    {
      "day": "Day 1",
      "title": "string",
      "topics": ["string"]
    }
  ]
}

REQUIREMENTS:

1. Generate a professional job title

2. Generate a realistic match score between 0-100

3. Generate 5 HIGH-QUALITY technical interview questions:
- Relevant to the job role
- Include frontend/backend/system design concepts if needed
- Include detailed practical answers
- Answers should sound like strong interview responses

4. Generate 5 HIGH-QUALITY behavioral interview questions:
- Use STAR method style answers
- Professional and realistic
- Include teamwork, leadership, debugging, communication, ownership, problem solving

5. Generate 5-7 skill gaps:
- Short
- Relevant
- Practical

6. Generate a DETAILED 7-day preparation roadmap:
- Each day must contain:
  - title
  - 3-5 practical preparation topics
- Make roadmap actionable and realistic

Candidate Resume:
${resume || "Not provided"}

Self Description:
${selfDescription || "Not provided"}

Job Description:
${jobDescription || "Not provided"}
`

    const models = [
    "mistralai/mistral-7b-instruct:free",
    "google/gemma-2-9b-it:free",
    "openchat/openchat-7b:free"
]

    let completion = null
    let lastError = null

    for (const model of models) {

        try {

            completion = await client.chat.completions.create({
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
            })

            console.log(`Using model: ${model}`)

            break

        } catch (error) {

            console.log(`Model failed: ${model}`)
            console.log(error.message)

            lastError = error
        }
    }

    if (!completion) {
        throw lastError
    }

    const response = completion.choices[0].message.content

    let parsedData = JSON.parse(response)

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
        setTimeout(() => reject(new Error("Request timeout")), 25000)
    )
])

    // fallback values
    parsedData.title = parsedData.title || "Software Developer"
    parsedData.matchScore = parsedData.matchScore || 75
    parsedData.technicalQuestions = parsedData.technicalQuestions || []
    parsedData.behavioralQuestions = parsedData.behavioralQuestions || []
    parsedData.skillGaps = parsedData.skillGaps || []
    parsedData.preparationPlan = parsedData.preparationPlan || []

    return parsedData
}


/**
 * Generate Resume PDF
 */
async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription
}) {

    return new Promise(async (resolve, reject) => {

        try {

            const prompt = `
Create a professional ATS optimized resume using:

Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}

Return the resume in clean professional plain text format.
`

            const completion = await client.chat.completions.create({
                model: "meta-llama/llama-3.3-70b-instruct:free",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.5
            })

            const generatedResume =
                completion.choices[0].message.content

            const doc = new PDFDocument({
                margin: 50
            })

            const buffers = []

            doc.on("data", buffers.push.bind(buffers))

            doc.on("end", () => {
                const pdfData = Buffer.concat(buffers)
                resolve(pdfData)
            })

            doc
                .fontSize(20)
                .text("Professional Resume", {
                    align: "center"
                })

            doc.moveDown()

            doc
                .fontSize(12)
                .text(generatedResume)

            doc.end()

        } catch (error) {
            reject(error)
        }

    })

}

module.exports = {
    generateInterviewReport,
    generateResumePdf
}