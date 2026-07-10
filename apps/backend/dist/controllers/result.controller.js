"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.remove = exports.update = exports.bulkCreate = exports.create = exports.getAll = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const result_model_1 = __importDefault(require("../models/result.model"));
const exam_model_1 = __importDefault(require("../models/exam.model"));
const student_model_1 = __importDefault(require("../models/student.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
// GET /results — List all or by exam
const getAll = async (req, res) => {
    const { examId, studentId, status, page = '1', limit = '50', search } = req.query;
    const filter = {};
    if (examId)
        filter.exam = examId;
    if (studentId)
        filter.student = studentId;
    if (status && ['passed', 'failed', 'absent'].includes(status))
        filter.status = status;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const [results, total] = await Promise.all([
        result_model_1.default.find(filter)
            .populate('exam', 'title examDate totalMarks passingMarks course')
            .populate({ path: 'exam', populate: { path: 'course', select: 'title.en slug category' } })
            .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
            .populate('enteredBy', 'email')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
        result_model_1.default.countDocuments(filter),
    ]);
    let resultList = results;
    if (search) {
        const s = search.toLowerCase();
        resultList = results.filter((r) => {
            const name = `${r.student?.profile?.firstName || ''} ${r.student?.profile?.lastName || ''}`.toLowerCase();
            const sid = (r.student?.studentId || '').toLowerCase();
            const examTitle = (r.exam?.title || '').toLowerCase();
            return name.includes(s) || sid.includes(s) || examTitle.includes(s);
        });
    }
    return api_response_1.default.paginated(res, resultList, { page: pageNum, limit: limitNum, total: search ? resultList.length : total });
};
exports.getAll = getAll;
// POST /results — Enter single result
const create = async (req, res) => {
    const { exam: examId, student: studentId, marksObtained, totalMarks, remarks, status } = req.body;
    // Validate exam and student exist
    const [exam, student] = await Promise.all([
        exam_model_1.default.findById(examId).lean(),
        student_model_1.default.findById(studentId).lean(),
    ]);
    if (!exam)
        throw new api_error_1.NotFoundError('Exam');
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    const payload = {
        exam: examId,
        student: studentId,
        marksObtained: marksObtained ?? 0,
        totalMarks: totalMarks || exam.totalMarks,
        remarks: remarks || '',
        status: status || (marksObtained == null ? 'absent' : undefined),
        enteredBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
    };
    const result = await result_model_1.default.create(payload);
    const populated = await result_model_1.default.findById(result._id)
        .populate('exam', 'title examDate totalMarks')
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
        .populate('enteredBy', 'email')
        .lean();
    // Update student GPA — average of all percentages
    const allResults = await result_model_1.default.find({ student: studentId }).lean();
    if (allResults.length > 0) {
        const avg = allResults.reduce((sum, r) => sum + r.percentage, 0) / allResults.length;
        await student_model_1.default.findByIdAndUpdate(studentId, { gpa: Math.round(avg) / 100 * 4 });
    }
    return api_response_1.default.created(res, populated, 'Result entered successfully');
};
exports.create = create;
// POST /results/bulk — Enter multiple results for an exam
const bulkCreate = async (req, res) => {
    const { exam: examId, results: resultsArray } = req.body;
    if (!examId || !resultsArray || !Array.isArray(resultsArray) || resultsArray.length === 0) {
        throw new api_error_1.BadRequestError('exam and results array are required');
    }
    const exam = await exam_model_1.default.findById(examId).lean();
    if (!exam)
        throw new api_error_1.NotFoundError('Exam');
    const ops = resultsArray.map((r) => ({
        updateOne: {
            filter: { exam: examId, student: r.student },
            update: {
                $set: {
                    marksObtained: r.marksObtained ?? 0,
                    totalMarks: r.totalMarks || exam.totalMarks,
                    remarks: r.remarks || '',
                    status: r.status || (r.marksObtained == null ? 'absent' : undefined),
                    enteredBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
                },
            },
            upsert: true,
        },
    }));
    await result_model_1.default.bulkWrite(ops);
    // Recalculate all affected students' GPAs
    const studentIds = [...new Set(resultsArray.map((r) => r.student))];
    for (const sid of studentIds) {
        const all = await result_model_1.default.find({ student: sid }).lean();
        if (all.length > 0) {
            const avg = all.reduce((sum, r) => sum + r.percentage, 0) / all.length;
            await student_model_1.default.findByIdAndUpdate(sid, { gpa: Math.round(avg) / 100 * 4 });
        }
    }
    const populated = await result_model_1.default.find({ exam: examId })
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
        .populate('enteredBy', 'email')
        .sort({ createdAt: -1 })
        .lean();
    return api_response_1.default.success(res, populated, `${resultsArray.length} results saved`);
};
exports.bulkCreate = bulkCreate;
// PATCH /results/:id
const update = async (req, res) => {
    const result = await result_model_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
        .populate('exam', 'title totalMarks')
        .lean();
    if (!result)
        throw new api_error_1.NotFoundError('Result');
    return api_response_1.default.success(res, result, 'Result updated');
};
exports.update = update;
// DELETE /results/:id
const remove = async (req, res) => {
    const result = await result_model_1.default.findByIdAndDelete(req.params.id);
    if (!result)
        throw new api_error_1.NotFoundError('Result');
    return api_response_1.default.noContent(res, 'Result deleted');
};
exports.remove = remove;
//# sourceMappingURL=result.controller.js.map