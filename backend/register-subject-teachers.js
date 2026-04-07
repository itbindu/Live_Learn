// backend/register-subject-teachers.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Teacher = require('./Models/Teacher');
const Student = require('./Models/Student'); // ← ADD THIS LINE
require('dotenv').config();

const subjectTeachers = [
  { firstName: 'Java', lastName: 'Teacher', email: 'java@virtualclass.com', phoneNumber: '9999999991', subject: 'Java', password: 'Teacher@123' },
  { firstName: 'C', lastName: 'Teacher', email: 'c@virtualclass.com', phoneNumber: '9999999992', subject: 'C', password: 'Teacher@123' },
  { firstName: 'Python', lastName: 'Teacher', email: 'python@virtualclass.com', phoneNumber: '9999999993', subject: 'Python', password: 'Teacher@123' },
  { firstName: 'C++', lastName: 'Teacher', email: 'cpp@virtualclass.com', phoneNumber: '9999999994', subject: 'C++', password: 'Teacher@123' }
];

async function registerSubjectTeachers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/virtual-classroom');
    console.log('✅ Connected to MongoDB');

    // Create subject teachers
    for (const teacherData of subjectTeachers) {
      const existing = await Teacher.findOne({ email: teacherData.email });
      if (existing) {
        console.log(`⚠️ Teacher ${teacherData.subject} already exists`);
        continue;
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(teacherData.password, salt);

      const teacher = new Teacher({
        firstName: teacherData.firstName,
        lastName: teacherData.lastName,
        email: teacherData.email,
        phoneNumber: teacherData.phoneNumber,
        password: hashedPassword,
        isEmailVerified: true,
        role: 'subject',
        subject: teacherData.subject,
        students: [],
        files: []
      });

      await teacher.save();
      console.log(`✅ Created Subject Teacher: ${teacherData.subject} (${teacherData.email} / Password: ${teacherData.password})`);
    }

    // After creating subject teachers, assign them to all approved students
    const approvedStudents = await Student.find({ isApproved: true });
    const subjectTeachersList = await Teacher.find({ role: 'subject' });
    
    console.log(`\n📚 Found ${approvedStudents.length} approved students`);
    console.log(`👨‍🏫 Found ${subjectTeachersList.length} subject teachers`);
    
    for (const student of approvedStudents) {
      let assignedCount = 0;
      for (const teacher of subjectTeachersList) {
        if (!student.teachers.includes(teacher._id)) {
          student.teachers.push(teacher._id);
          await Teacher.findByIdAndUpdate(teacher._id, { $addToSet: { students: student._id } });
          assignedCount++;
        }
      }
      await student.save();
      console.log(`✅ Updated student ${student.email}: added ${assignedCount} subject teachers (Total now: ${student.teachers.length})`);
    }

    console.log('\n🎉 All subject teachers created and assigned to existing students!');
    console.log('\n📝 Subject Teacher Login Credentials:');
    console.log('   =================================');
    for (const teacher of subjectTeachers) {
      console.log(`   📖 ${teacher.subject} Teacher:`);
      console.log(`      Email: ${teacher.email}`);
      console.log(`      Password: ${teacher.password}`);
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

registerSubjectTeachers();