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
You are an expert AI interview coach.

Analyze the candidate profile and generate:

1. Job title
2. Match score (0-100)
3. 10 technical interview questions with:
   - question
   - intention
   - detailed model answer

4. 10 behavioral interview questions with:
   - question
   - intention
   - detailed STAR format answer

5. Skill gaps (array)

6. A 7-day preparation roadmap

Return ONLY valid JSON.

Candidate Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}
`

    const completion = await client.chat.completions.create({
        model: "deepseek/deepseek-chat-v3-0324:free",
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

    const response = completion.choices[0].message.content

    return JSON.parse(response)
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
                model: "deepseek/deepseek-chat-v3-0324:free",
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