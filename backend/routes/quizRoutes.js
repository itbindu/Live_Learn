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

// GET NOTIFICATIONS FOR STUDENT
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).select('notifications');
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const notifications = (student.notifications || []).sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    res.status(200).json({ 
      success: true, 
      notifications,
      unreadCount: notifications.filter(n => !n.read).length
    });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// MARK NOTIFICATION AS READ
router.put('/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const notification = student.notifications.id(req.params.notificationId);
    if (notification) {
      notification.read = true;
      await student.save();
    }
    
    res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
});

// MARK ALL NOTIFICATIONS AS READ
router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    student.notifications.forEach(notification => {
      notification.read = true;
    });
    await student.save();
    
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
});

// ==================== QUIZ ENDPOINTS ====================

// CREATE QUIZ (Teacher only)
router.post('/create', authenticateToken, async (req, res) => {
  const { title, questions, timeLimit } = req.body;
  
  if (!title || !questions || !timeLimit) {
    return res.status(400).json({ message: 'All fields required' });
  }
  
  if (timeLimit <= 0) {
    return res.status(400).json({ message: 'Time limit must be at least 1 minute' });
  }

  try {
    const quiz = new Quiz({ 
      title, 
      questions, 
      timeLimit, 
      teacherId: req.user.id 
    });
    await quiz.save();

    const teacher = await Teacher.findById(req.user.id).populate('students');
    const assignedStudents = teacher.students || [];
    const frontendUrl = getFrontendUrl();

    let emailSuccessCount = 0;
    let emailFailCount = 0;

    for (const student of assignedStudents) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: student.email,
          subject: `📝 New Proctored Quiz Available: ${title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">📝 New Quiz!</h1>
              </div>
              <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                <p>Hello <strong>${student.firstName} ${student.lastName}</strong>,</p>
                <p>Your teacher <strong>${teacher.firstName} ${teacher.lastName}</strong> has created a new proctored quiz.</p>
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0;">Quiz Details:</h3>
                  <table style="width: 100%;">
                    <tr><td style="padding: 5px 0;"><strong>Title:</strong></td><td>${title}</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Time Limit:</strong></td><td>${timeLimit} minutes</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Questions:</strong></td><td>${questions.length}</td></tr>
                  </table>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${frontendUrl}/student/quizzes" 
                     style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Take Quiz Now →
                  </a>
                </div>
              </div>
            </div>
          `,
        });
        emailSuccessCount++;
      } catch (emailErr) {
        console.error(`Email sending failed for ${student.email}:`, emailErr);
        emailFailCount++;
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

    res.status(201).json({ 
      success: true, 
      message: `Quiz created successfully! Notified ${emailSuccessCount} students via email.`,
      quiz,
      notificationStats: {
        emailsSent: emailSuccessCount,
        emailsFailed: emailFailCount,
        inAppNotifications: assignedStudents.length
      }
    });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ message: 'Failed to create quiz' });
  }
});

// ==================== IMPORTANT: NEW ENDPOINT FOR TEACHER-SPECIFIC QUIZZES ====================
// THIS MUST COME BEFORE THE /list and /:id routes to avoid conflicts

// GET QUIZZES BY SPECIFIC TEACHER (for subject-specific view)
router.get('/teacher/:teacherId', authenticateToken, async (req, res) => {
  try {
    console.log('=== TEACHER QUIZZES ENDPOINT CALLED ===');
    console.log('Teacher ID param:', req.params.teacherId);
    console.log('Student ID from token:', req.user.id);
    
    const student = await Student.findById(req.user.id).populate('teachers');
    
    if (!student) {
      console.log('Student not found');
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    console.log('Student teachers:', student.teachers.map(t => ({ id: t._id.toString(), name: t.firstName, subject: t.subject })));
    
    // Verify this teacher is assigned to the student
    const teacherIdParam = req.params.teacherId;
    const isAssigned = student.teachers.some(t => t._id.toString() === teacherIdParam);
    
    console.log('Is teacher assigned to student?', isAssigned);
    
    if (!isAssigned) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view these quizzes. This teacher is not assigned to you.' 
      });
    }
    
    const teacher = await Teacher.findById(teacherIdParam).select('firstName lastName subject');
    
    if (!teacher) {
      console.log('Teacher not found');
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    console.log('Teacher found:', { name: `${teacher.firstName} ${teacher.lastName}`, subject: teacher.subject });
    
    // Get quizzes for this specific teacher
    const quizzes = await Quiz.find({ teacherId: teacherIdParam })
      .sort({ createdAt: -1 })
      .select('title timeLimit createdAt questions');
    
    console.log(`Found ${quizzes.length} quizzes for teacher ${teacherIdParam}`);
    
    // Check which quizzes are already submitted by this student
    const submissions = await Submission.find({ 
      studentId: req.user.id,
      quizId: { $in: quizzes.map(q => q._id) }
    }).select('quizId');
    
    const submittedQuizIds = new Set(submissions.map(s => s.quizId.toString()));
    
    const quizzesWithStatus = quizzes.map(quiz => ({
      ...quiz.toObject(),
      submitted: submittedQuizIds.has(quiz._id.toString()),
      teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unknown Teacher',
      subject: teacher?.subject || 'Unknown Subject'
    }));
    
    console.log('Sending response with quizzes:', quizzesWithStatus.length);
    
    res.status(200).json({ 
      success: true, 
      quizzes: quizzesWithStatus,
      teacherId: teacherIdParam,
      teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
      subject: teacher?.subject
    });
  } catch (error) {
    console.error('Error fetching teacher quizzes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes: ' + error.message });
  }
});

// LIST QUIZZES FOR STUDENT (all assigned teachers)
router.get('/list', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching quiz list for student:', req.user.id);
    
    const student = await Student.findById(req.user.id).populate('teachers');
    
    if (!student) {
      console.log('Student not found:', req.user.id);
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    console.log('Student found:', {
      id: student._id,
      name: `${student.firstName} ${student.lastName}`,
      teacherCount: student.teachers?.length || 0
    });

    if (!student.teachers || student.teachers.length === 0) {
      console.log('Student has no teachers assigned');
      return res.status(200).json({ 
        success: true, 
        quizzes: [],
        message: 'No teachers assigned yet'
      });
    }

    const teacherIds = student.teachers.map(t => t._id);
    console.log('Teacher IDs:', teacherIds.map(id => id.toString()));

    const quizzes = await Quiz.find({ teacherId: { $in: teacherIds } })
      .populate('teacherId', 'firstName lastName subject')
      .sort({ createdAt: -1 })
      .select('title timeLimit createdAt questions teacherId');

    console.log(`Found ${quizzes.length} quizzes for student`);

    const submissions = await Submission.find({ 
      studentId: req.user.id 
    }).select('quizId');
    
    const submittedQuizIds = new Set(
      submissions.map(s => s.quizId.toString())
    );

    const quizzesWithStatus = quizzes.map(quiz => ({
      ...quiz.toObject(),
      submitted: submittedQuizIds.has(quiz._id.toString()),
      teacherName: quiz.teacherId ? `${quiz.teacherId.firstName} ${quiz.teacherId.lastName}` : 'Unknown Teacher',
      subject: quiz.teacherId?.subject || 'Unknown Subject'
    }));

    res.status(200).json({ 
      success: true, 
      quizzes: quizzesWithStatus
    });
    
  } catch (error) {
    console.error('Error fetching quiz list:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load quizzes.',
      error: error.message 
    });
  }
});

// TEACHER'S QUIZZES (for teacher dashboard)
router.get('/my-quizzes', authenticateToken, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.user.id })
      .sort({ createdAt: -1 })
      .select('title timeLimit createdAt questions');
      
    res.status(200).json({ success: true, quizzes });
  } catch (error) {
    console.error('Error fetching teacher quizzes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes' });
  }
});

// STUDENT LEADERBOARD (My Performance)
router.get('/student/leaderboard', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const submissions = await Submission.find({ studentId: req.user.id })
      .populate('quizId', 'title questions')
      .sort({ submittedAt: -1 });

    const results = submissions.map((sub, index) => ({
      rank: index + 1,
      quizTitle: sub.quizId?.title || 'Unknown Quiz',
      score: sub.score,
      total: sub.quizId?.questions?.length || 0,
      percentage: sub.quizId?.questions?.length 
        ? Math.round((sub.score / sub.quizId.questions.length) * 100) 
        : 0,
      submittedAt: sub.submittedAt,
    }));

    res.status(200).json({
      success: true,
      leaderboard: results
    });
    
  } catch (error) {
    console.error('Student leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
  }
});

// CHECK IF STUDENT HAS ALREADY SUBMITTED
router.get('/check-submission/:quizId', authenticateToken, async (req, res) => {
  try {
    const submission = await Submission.findOne({
      studentId: req.user.id,
      quizId: req.params.quizId,
    });
    res.status(200).json({ submitted: !!submission });
  } catch (error) {
    console.error('Check submission error:', error);
    res.status(500).json({ submitted: false, message: 'Server error' });
  }
});

// GET QUIZ STATISTICS (Teacher only)
router.get('/:quizId/stats', authenticateToken, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    if (quiz.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    const submissions = await Submission.find({ quizId: req.params.quizId });
    
    const totalSubmissions = submissions.length;
    let avgScore = 0;
    
    if (totalSubmissions > 0) {
      const totalScore = submissions.reduce((sum, sub) => sum + sub.score, 0);
      avgScore = Math.round((totalScore / (totalSubmissions * quiz.questions.length)) * 100);
    }
    
    res.status(200).json({
      success: true,
      submissions: totalSubmissions,
      avgScore,
      totalQuestions: quiz.questions.length
    });
    
  } catch (error) {
    console.error('Quiz stats error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz statistics' });
  }
});

// GET LEADERBOARD FOR SPECIFIC QUIZ (Teacher view)
router.get('/:quizId/leaderboard', authenticateToken, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    
    const submissions = await Submission.find({ quizId: req.params.quizId })
      .populate('studentId', 'firstName lastName email')
      .sort({ score: -1, submittedAt: 1 });

    const leaderboard = submissions.map((sub, index) => ({
      rank: index + 1,
      studentName: sub.studentId ? `${sub.studentId.firstName} ${sub.studentId.lastName}` : 'Unknown Student',
      email: sub.studentId?.email,
      score: sub.score,
      total: quiz.questions.length,
      percentage: Math.round((sub.score / quiz.questions.length) * 100),
      submittedAt: sub.submittedAt,
    }));

    res.status(200).json({ 
      success: true, 
      quizTitle: quiz.title, 
      leaderboard 
    });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
  }
});

// SUBMIT QUIZ (with proctoring data)
router.post('/submit/:quizId', authenticateToken, async (req, res) => {
  const { answers, proctoringData } = req.body;
  
  if (!Array.isArray(answers)) {
    return res.status(400).json({ success: false, message: 'Answers must be an array' });
  }

  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    const existing = await Submission.findOne({
      studentId: req.user.id,
      quizId: req.params.quizId,
    });
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already submitted this quiz.' 
      });
    }

    let score = 0;
    const correctAnswers = quiz.questions.map(q => q.correctAnswer);

    answers.forEach((answer, index) => {
      if (answer && answer.trim() !== '') {
        if (quiz.questions[index].type === 'mcq') {
          if (answer.toUpperCase() === correctAnswers[index].toUpperCase()) {
            score++;
          }
        } else {
          if (answer.trim().toLowerCase() === correctAnswers[index].trim().toLowerCase()) {
            score++;
          }
        }
      }
    });

    const submission = new Submission({
      studentId: req.user.id,
      quizId: req.params.quizId,
      answers,
      score,
      proctoringData: proctoringData || {}
    });
    
    await submission.save();

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
    res.status(500).json({ success: false, message: 'Failed to submit quiz' });
  }
});

// UPDATE QUIZ (Teacher only)
router.put('/:id', authenticateToken, async (req, res) => {
  const { title, questions, timeLimit } = req.body;
  
  try {
    const quiz = await Quiz.findById(req.params.id);
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    if (quiz.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    quiz.title = title || quiz.title;
    quiz.questions = questions || quiz.questions;
    quiz.timeLimit = timeLimit || quiz.timeLimit;
    
    await quiz.save();
    
    res.status(200).json({ 
      success: true, 
      message: 'Quiz updated successfully',
      quiz 
    });
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ message: 'Failed to update quiz' });
  }
});

// DELETE QUIZ (Teacher only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    if (quiz.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    await Submission.deleteMany({ quizId: req.params.id });
    await Quiz.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ 
      success: true, 
      message: 'Quiz and associated submissions deleted successfully' 
    });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ message: 'Failed to delete quiz' });
  }
});

// GET QUIZ RESULT (Student)
router.get('/result/:quizId', authenticateToken, async (req, res) => {
  try {
    const submission = await Submission.findOne({
      studentId: req.user.id,
      quizId: req.params.quizId
    });

    if (!submission) {
      return res.status(404).json({ message: 'Result not found' });
    }

    const quiz = await Quiz.findById(req.params.quizId);

    res.json({
      score: submission.score,
      total: quiz.questions.length,
      percentage: Math.round((submission.score / quiz.questions.length) * 100)
    });

  } catch (err) {
    res.status(500).json({ message: 'Error fetching result' });
  }
});

// GET SINGLE QUIZ (THIS MUST BE LAST - catches /:id)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching single quiz with ID:', req.params.id);
    
    const quiz = await Quiz.findById(req.params.id);
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    res.status(200).json({ success: true, quiz });
  } catch (error) {
    console.error('Fetch quiz error:', error);
    res.status(500).json({ message: 'Failed to fetch quiz' });
  }
});

module.exports = router;