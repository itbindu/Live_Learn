// backend/fix-to-4-teachers.js
const mongoose = require('mongoose');
const Teacher = require('./Models/Teacher');
const Student = require('./Models/Student');
require('dotenv').config();

async function fixTo4Teachers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/virtual-classroom');
    console.log('✅ Connected to MongoDB\n');

    // ============ STEP 1: CHECK CURRENT STATE ============
    let classTeachers = await Teacher.find({ role: 'class' });
    let subjectTeachers = await Teacher.find({ role: 'subject' });
    
    console.log('📊 CURRENT STATE:');
    console.log(`   Class Teachers: ${classTeachers.length}`);
    console.log(`   Subject Teachers: ${subjectTeachers.length}`);
    console.log(`   Total: ${classTeachers.length + subjectTeachers.length}\n`);

    // ============ STEP 2: KEEP ONLY 1 CLASS TEACHER ============
    if (classTeachers.length > 1) {
      console.log('🗑️ Removing extra Class Teachers...');
      for (let i = 1; i < classTeachers.length; i++) {
        const teacher = classTeachers[i];
        await Student.updateMany(
          { teachers: teacher._id },
          { $pull: { teachers: teacher._id } }
        );
        await Teacher.findByIdAndDelete(teacher._id);
        console.log(`   Deleted: ${teacher.firstName} ${teacher.lastName}`);
      }
    }
    
    // Get the ONE class teacher
    classTeachers = await Teacher.find({ role: 'class' });
    const classTeacher = classTeachers[0];
    console.log(`\n✅ Class Teacher: ${classTeacher.firstName} ${classTeacher.lastName} (${classTeacher.subject})\n`);

    // ============ STEP 3: KEEP ONLY 3 SUBJECT TEACHERS (C, Python, C++) ============
    const subjectsToKeep = ['C', 'Python', 'C++'];
    
    // Delete any subject teacher that is NOT in subjectsToKeep
    subjectTeachers = await Teacher.find({ role: 'subject' });
    
    console.log('📖 Processing Subject Teachers:');
    for (const teacher of subjectTeachers) {
      if (!subjectsToKeep.includes(teacher.subject)) {
        // Delete this teacher
        await Student.updateMany(
          { teachers: teacher._id },
          { $pull: { teachers: teacher._id } }
        );
        await Teacher.findByIdAndDelete(teacher._id);
        console.log(`   🗑️ Deleted: ${teacher.firstName} ${teacher.lastName} (${teacher.subject}) - Not needed`);
      }
    }
    
    // Now check which subjects we have and create missing ones
    subjectTeachers = await Teacher.find({ role: 'subject' });
    const existingSubjects = subjectTeachers.map(t => t.subject);
    
    console.log('\n📚 Checking for missing subject teachers:');
    for (const subject of subjectsToKeep) {
      if (!existingSubjects.includes(subject)) {
        // Create missing subject teacher
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('Teacher@123', salt);
        
        const newTeacher = new Teacher({
          firstName: `${subject}`,
          lastName: 'Teacher',
          email: `${subject.toLowerCase()}@virtualclass.com`,
          phoneNumber: `999999999${subjectsToKeep.indexOf(subject) + 5}`,
          password: hashedPassword,
          isEmailVerified: true,
          role: 'subject',
          subject: subject,
          students: [],
          files: []
        });
        
        await newTeacher.save();
        console.log(`   ✅ Created: ${subject} Teacher (${subject.toLowerCase()}@virtualclass.com / Teacher@123)`);
      } else {
        console.log(`   ✅ Already exists: ${subject} Teacher`);
      }
    }
    
    // ============ STEP 4: GET FINAL TEACHERS ============
    const finalClassTeacher = await Teacher.findOne({ role: 'class' });
    const finalSubjectTeachers = await Teacher.find({ 
      role: 'subject', 
      subject: { $in: subjectsToKeep } 
    });
    
    console.log(`\n👨‍🏫 FINAL TEACHERS:`);
    console.log(`   Class Teacher: ${finalClassTeacher.firstName} ${finalClassTeacher.lastName} (${finalClassTeacher.subject})`);
    for (const t of finalSubjectTeachers) {
      console.log(`   Subject Teacher: ${t.firstName} ${t.lastName} (${t.subject})`);
    }
    console.log(`   Total: ${1 + finalSubjectTeachers.length} teachers\n`);

    // ============ STEP 5: REASSIGN ALL STUDENTS ============
    const allStudents = await Student.find();
    
    console.log('📚 Reassigning students...');
    for (const student of allStudents) {
      // Clear existing teachers
      student.teachers = [];
      
      // Add Class Teacher
      student.teachers.push(finalClassTeacher._id);
      
      // Add all Subject Teachers
      for (const teacher of finalSubjectTeachers) {
        student.teachers.push(teacher._id);
      }
      
      await student.save();
      
      // Update teacher's student lists
      await Teacher.findByIdAndUpdate(finalClassTeacher._id, { 
        $addToSet: { students: student._id } 
      });
      
      for (const teacher of finalSubjectTeachers) {
        await Teacher.findByIdAndUpdate(teacher._id, { 
          $addToSet: { students: student._id } 
        });
      }
      
      console.log(`   ✅ ${student.firstName} ${student.lastName}: ${student.teachers.length} teachers assigned`);
    }
    
    // ============ STEP 6: FINAL RESULT ============
    const finalClassCount = await Teacher.countDocuments({ role: 'class' });
    const finalSubjectCount = await Teacher.countDocuments({ role: 'subject', subject: { $in: subjectsToKeep } });
    const sampleStudent = await Student.findOne().populate('teachers', 'firstName lastName subject role');
    
    console.log(`\n🎉 FINAL RESULT:`);
    console.log(`   👨‍🏫 Class Teachers: ${finalClassCount}`);
    console.log(`   📖 Subject Teachers: ${finalSubjectCount}`);
    console.log(`   📚 Total Teachers per Student: ${finalClassCount + finalSubjectCount}`);
    
    console.log(`\n📝 Student's Teachers:`);
    if (sampleStudent) {
      for (const teacher of sampleStudent.teachers) {
        console.log(`   - ${teacher.firstName} ${teacher.lastName} (${teacher.role === 'class' ? 'Class Teacher' : 'Subject Teacher'} - ${teacher.subject})`);
      }
    }
    
    console.log(`\n✅ SUCCESS! Each student now has ${finalClassCount + finalSubjectCount} teachers.`);
    console.log(`\n🔐 Subject Teacher Logins:`);
    console.log(`   Password for all: Teacher@123`);
    for (const teacher of finalSubjectTeachers) {
      console.log(`   ${teacher.subject}: ${teacher.email}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Add bcrypt since we need it
const bcrypt = require('bcryptjs');
fixTo4Teachers();