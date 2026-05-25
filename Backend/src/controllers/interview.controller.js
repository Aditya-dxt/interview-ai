const pdfParse = require("pdf-parse")
const {
    generateInterviewReport,
    generateResumePdf
} = require("../services/ai.service")

const interviewReportModel = require("../models/interviewReport.model")



/**
 * @description Generate interview report
 */
async function generateInterViewReportController(req, res) {

    try {

        let resumeText = ""

        // Handle optional resume upload
        if (req.file) {

            const resumeContent =
                await (new pdfParse.PDFParse(
                    Uint8Array.from(req.file.buffer)
                )).getText()

            resumeText = resumeContent.text || ""
        }

        const {
            selfDescription,
            jobDescription
        } = req.body

        // Validation
        if (!jobDescription) {
            return res.status(400).json({
                message: "Job description is required"
            })
        }

        // Generate AI report
        const interViewReportByAi =
            await generateInterviewReport({
                resume: resumeText,
                selfDescription,
                jobDescription
            })

        // Save in DB
        const interviewReport =
            await interviewReportModel.create({
                user: req.user.id,
                resume: resumeText,
                selfDescription,
                jobDescription,
                ...interViewReportByAi
            })

        res.status(201).json({
            message: "Interview report generated successfully.",
            interviewReport
        })

    } catch (error) {

        console.log("Generate Interview Error:", error)

        res.status(500).json({
            message: "Failed to generate interview report",
            error: error.message
        })

    }

}



/**
 * @description Get interview report by ID
 */
async function getInterviewReportByIdController(req, res) {

    try {

        const { interviewId } = req.params

        const interviewReport =
            await interviewReportModel.findOne({
                _id: interviewId,
                user: req.user.id
            })

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        res.status(200).json({
            message: "Interview report fetched successfully.",
            interviewReport
        })

    } catch (error) {

        console.log("Get Report Error:", error)

        res.status(500).json({
            message: "Failed to fetch interview report",
            error: error.message
        })

    }

}



/**
 * @description Get all interview reports
 */
async function getAllInterviewReportsController(req, res) {

    try {

        const interviewReports =
            await interviewReportModel
                .find({ user: req.user.id })
                .sort({ createdAt: -1 })
                .select(
                    "-resume -selfDescription -jobDescription -__v"
                )

        res.status(200).json({
            message: "Interview reports fetched successfully.",
            interviewReports
        })

    } catch (error) {

        console.log("Get Reports Error:", error)

        res.status(500).json({
            message: "Failed to fetch interview reports",
            error: error.message
        })

    }

}



/**
 * @description Generate Resume PDF
 */
async function generateResumePdfController(req, res) {

    try {

        const { interviewReportId } = req.params

        const interviewReport =
            await interviewReportModel.findById(interviewReportId)

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        const {
            resume,
            jobDescription,
            selfDescription
        } = interviewReport

        // Generate PDF buffer
        const pdfBuffer =
            await generateResumePdf({
                resume,
                jobDescription,
                selfDescription
            })

        // Response headers
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition":
                `attachment; filename=resume_${interviewReportId}.pdf`
        })

        return res.send(pdfBuffer)

    } catch (error) {

        console.log("Resume PDF Error:", error)

        res.status(500).json({
            message: "Failed to generate resume PDF",
            error: error.message
        })

    }

}



module.exports = {
    generateInterViewReportController,
    getInterviewReportByIdController,
    getAllInterviewReportsController,
    generateResumePdfController
}