const express = require('express');
const Quiz = require('../Models/Quiz');
const Teacher = require('../Models/Teacher');
const Student = require('../Models/Student');
const Submission = require('../Models/Submission');
const authenticateToken = require('../middleware/auth');
const nodemailer = require('nodemailer');
const { getFrontendUrl } = require('../utils/urlHelper');

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==================== NOTIFICATION ENDPOINTS ====================

router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).select('notifications');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const notifications = (student.notifications || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.status(200).json({ success: true, notifications, unreadCount: notifications.filter(n => !n.read).length });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

router.put('/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const notification = student.notifications.id(req.params.notificationId);
    if (notification) notification.read = true;
    await student.save();
    res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    student.notifications.forEach(notification => { notification.read = true; });
    await student.save();
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
});

// ==================== SPECIFIC ROUTES FIRST (MUST COME BEFORE /:id) ====================

// GET QUIZZES BY SPECIFIC TEACHER
router.get('/teacher/:teacherId', authenticateToken, async (req, res) => {
  try {
    console.log('=== TEACHER QUIZZES ENDPOINT CALLED ===');
    const student = await Student.findById(req.user.id).populate('teachers');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    const isAssigned = student.teachers.some(t => t._id.toString() === req.params.teacherId);
    if (!isAssigned) {
      return res.status(403).json({ success: false, message: 'Not authorized to view these quizzes.' });
    }
    
    const teacher = await Teacher.findById(req.params.teacherId).select('firstName lastName subject');
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    
    const quizzes = await Quiz.find({ teacherId: req.params.teacherId }).sort({ createdAt: -1 }).select('title timeLimit createdAt questions');
    const submissions = await Submission.find({ studentId: req.user.id, quizId: { $in: quizzes.map(q => q._id) } }).select('quizId');
    const submittedQuizIds = new Set(submissions.map(s => s.quizId.toString()));
    
    const quizzesWithStatus = quizzes.map(quiz => ({
      ...quiz.toObject(),
      submitted: submittedQuizIds.has(quiz._id.toString()),
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      subject: teacher.subject
    }));
    
    res.status(200).json({ success: true, quizzes: quizzesWithStatus, teacherId: req.params.teacherId, teacherName: `${teacher.firstName} ${teacher.lastName}`, subject: teacher.subject });
  } catch (error) {
    console.error('Error fetching teacher quizzes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes: ' + error.message });
  }
});

// LIST QUIZZES FOR STUDENT
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).populate('teachers');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    if (!student.teachers || student.teachers.length === 0) {
      return res.status(200).json({ success: true, quizzes: [], message: 'No teachers assigned yet' });
    }
    
    const teacherIds = student.teachers.map(t => t._id);
    const quizzes = await Quiz.find({ teacherId: { $in: teacherIds } }).populate('teacherId', 'firstName lastName subject').sort({ createdAt: -1 }).select('title timeLimit createdAt questions teacherId');
    const submissions = await Submission.find({ studentId: req.user.id }).select('quizId');
    const submittedQuizIds = new Set(submissions.map(s => s.quizId.toString()));
    
    const quizzesWithStatus = quizzes.map(quiz => ({
      ...quiz.toObject(),
      submitted: submittedQuizIds.has(quiz._id.toString()),
      teacherName: quiz.teacherId ? `${quiz.teacherId.firstName} ${quiz.teacherId.lastName}` : 'Unknown Teacher',
      subject: quiz.teacherId?.subject || 'Unknown Subject'
    }));
    
    res.status(200).json({ success: true, quizzes: quizzesWithStatus });
  } catch (error) {
    console.error('Error fetching quiz list:', error);
    res.status(500).json({ success: false, message: 'Failed to load quizzes.', error: error.message });
  }
});

// TEACHER'S QUIZZES
router.get('/my-quizzes', authenticateToken, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.user.id }).sort({ createdAt: -1 }).select('title timeLimit createdAt questions');
    res.status(200).json({ success: true, quizzes });
  } catch (error) {
    console.error('Error fetching teacher quizzes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes' });
  }
});

// STUDENT LEADERBOARD
router.get('/student/leaderboard', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const submissions = await Submission.find({ studentId: req.user.id }).populate('quizId', 'title questions').sort({ submittedAt: -1 });
    const results = submissions.map((sub, index) => ({
      rank: index + 1,
      quizTitle: sub.quizId?.title || 'Unknown Quiz',
      score: sub.score,
      total: sub.quizId?.questions?.length || 0,
      percentage: sub.quizId?.questions?.length ? Math.round((sub.score / sub.quizId.questions.length) * 100) : 0,
      submittedAt: sub.submittedAt,
    }));
    res.status(200).json({ success: true, leaderboard: results });
  } catch (error) {
    console.error('Student leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
  }
});

// CHECK IF STUDENT HAS ALREADY SUBMITTED
router.get('/check-submission/:quizId', authenticateToken, async (req, res) => {
  try {
    const submission = await Submission.findOne({ studentId: req.user.id, quizId: req.params.quizId });
    res.status(200).json({ submitted: !!submission });
  } catch (error) {
    console.error('Check submission error:', error);
    res.status(500).json({ submitted: false, message: 'Server error' });
  }
});

// GET QUIZ STATISTICS
router.get('/:quizId/stats', authenticateToken, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (quiz.teacherId.toString() !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });
    const submissions = await Submission.find({ quizId: req.params.quizId });
    const totalSubmissions = submissions.length;
    let avgScore = 0;
    if (totalSubmissions > 0) {
      const totalScore = submissions.reduce((sum, sub) => sum + sub.score, 0);
      avgScore = Math.round((totalScore / (totalSubmissions * quiz.questions.length)) * 100);
    }
    res.status(200).json({ success: true, submissions: totalSubmissions, avgScore, totalQuestions: quiz.questions.length });
  } catch (error) {
    console.error('Quiz stats error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz statistics' });
  }
});

// GET LEADERBOARD FOR SPECIFIC QUIZ
router.get('/:quizId/leaderboard', authenticateToken, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    const submissions = await Submission.find({ quizId: req.params.quizId }).populate('studentId', 'firstName lastName email').sort({ score: -1, submittedAt: 1 });
    const leaderboard = submissions.map((sub, index) => ({
      rank: index + 1,
      studentName: sub.studentId ? `${sub.studentId.firstName} ${sub.studentId.lastName}` : 'Unknown Student',
      email: sub.studentId?.email,
      score: sub.score,
      total: quiz.questions.length,
      percentage: Math.round((sub.score / quiz.questions.length) * 100),
      submittedAt: sub.submittedAt,
    }));
    res.status(200).json({ success: true, quizTitle: quiz.title, leaderboard });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
  }
});

// GET QUIZ RESULT
router.get('/result/:quizId', authenticateToken, async (req, res) => {
  try {
    const submission = await Submission.findOne({ studentId: req.user.id, quizId: req.params.quizId });
    if (!submission) return res.status(404).json({ message: 'Result not found' });
    const quiz = await Quiz.findById(req.params.quizId);
    res.json({ score: submission.score, total: quiz.questions.length, percentage: Math.round((submission.score / quiz.questions.length) * 100) });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching result' });
  }
});

// ==================== SUBMIT QUIZ - IMPORTANT: This must be BEFORE /:id ====================
router.post('/submit/:quizId', authenticateToken, async (req, res) => {
  const { answers, proctoringData } = req.body;
  
  console.log('=== SUBMIT QUIZ CALLED ===');
  console.log('Quiz ID:', req.params.quizId);
  console.log('Student ID:', req.user.id);
  console.log('Answers received:', answers);
  
  if (!Array.isArray(answers)) {
    console.error('Answers is not an array:', answers);
    return res.status(400).json({ success: false, message: 'Answers must be an array' });
  }

  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      console.error('Quiz not found:', req.params.quizId);
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    
    console.log('Quiz found:', quiz.title, 'Questions:', quiz.questions.length);

    const existing = await Submission.findOne({ studentId: req.user.id, quizId: req.params.quizId });
    if (existing) {
      console.error('Duplicate submission detected');
      return res.status(400).json({ success: false, message: 'You have already submitted this quiz.' });
    }

    let score = 0;
    const correctAnswers = quiz.questions.map(q => q.correctAnswer);

    answers.forEach((answer, index) => {
      if (answer && answer.trim() !== '') {
        if (quiz.questions[index].type === 'mcq') {
          if (answer.toUpperCase() === correctAnswers[index].toUpperCase()) score++;
        } else {
          if (answer.trim().toLowerCase() === correctAnswers[index].trim().toLowerCase()) score++;
        }
      }
    });
    
    console.log('Score calculated:', score, '/', quiz.questions.length);

    const submission = new Submission({
      studentId: req.user.id,
      quizId: req.params.quizId,
      answers,
      score,
      proctoringData: proctoringData || {}
    });
    
    await submission.save();
    console.log('Submission saved with ID:', submission._id);

    const student = await Student.findById(req.user.id);
    if (student) {
      student.notifications = student.notifications || [];
      student.notifications.push({
        message: `✅ Quiz "${quiz.title}" submitted successfully! Score: ${score}/${quiz.questions.length}`,
        read: false,
        createdAt: new Date(),
        type: 'quiz_result',
        link: `/quiz-result/${quiz._id}`
      });
      await student.save();
    }

    res.status(200).json({
      success: true,
      message: 'Quiz submitted successfully',
      score: score,
      percentage: Math.round((score / quiz.questions.length) * 100),
      correctAnswers,
      totalQuestions: quiz.questions.length,
    });
    
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit quiz: ' + error.message });
  }
});

// ==================== UPDATE QUIZ ====================
router.put('/:id', authenticateToken, async (req, res) => {
  const { title, questions, timeLimit } = req.body;
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (quiz.teacherId.toString() !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });
    quiz.title = title || quiz.title;
    quiz.questions = questions || quiz.questions;
    quiz.timeLimit = timeLimit || quiz.timeLimit;
    await quiz.save();
    res.status(200).json({ success: true, message: 'Quiz updated successfully', quiz });
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ message: 'Failed to update quiz' });
  }
});

// ==================== DELETE QUIZ ====================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (quiz.teacherId.toString() !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });
    await Submission.deleteMany({ quizId: req.params.id });
    await Quiz.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Quiz and associated submissions deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ message: 'Failed to delete quiz' });
  }
});

// ==================== CREATE QUIZ ====================
router.post('/create', authenticateToken, async (req, res) => {
  const { title, questions, timeLimit } = req.body;
  if (!title || !questions || !timeLimit) return res.status(400).json({ message: 'All fields required' });
  if (timeLimit <= 0) return res.status(400).json({ message: 'Time limit must be at least 1 minute' });

  try {
    const quiz = new Quiz({ title, questions, timeLimit, teacherId: req.user.id });
    await quiz.save();

    const teacher = await Teacher.findById(req.user.id).populate('students');
    const assignedStudents = teacher.students || [];
    const frontendUrl = getFrontendUrl();

    let emailSuccessCount = 0;
    for (const student of assignedStudents) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: student.email,
          subject: `📝 New Proctored Quiz Available: ${title}`,
          html: `<div><h2>New Quiz: ${title}</h2><p>Time: ${timeLimit} minutes</p><a href="${frontendUrl}/proctored-quiz/${quiz._id}">Take Quiz</a></div>`,
        });
        emailSuccessCount++;
      } catch (emailErr) {
        console.error(`Email failed for ${student.email}:`, emailErr);
      }

      student.notifications = student.notifications || [];
      student.notifications.push({
        message: `📝 New Proctored Quiz: "${title}" (${timeLimit} min, ${questions.length} questions)`,
        read: false,
        createdAt: new Date(),
        type: 'quiz',
        link: `/proctored-quiz/${quiz._id}`
      });
      await student.save();
    }

    res.status(201).json({ success: true, message: `Quiz created! Notified ${emailSuccessCount} students.`, quiz });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ message: 'Failed to create quiz' });
  }
});

// ==================== GET SINGLE QUIZ - MUST BE LAST! ====================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching single quiz with ID:', req.params.id);
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    res.status(200).json({ success: true, quiz });
  } catch (error) {
    console.error('Fetch quiz error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz' });
  }
});

module.exports = router;