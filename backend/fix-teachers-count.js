// backend/fix-teachers-count.js
const mongoose = require('mongoose');
const Teacher = require('./Models/Teacher');
const Student = require('./Models/Student');
require('dotenv').config();

async function fixTeachersCount() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/virtual-classroom');
    console.log('✅ Connected to MongoDB');

    // Get all teachers
    const allTeachers = await Teacher.find();
    console.log(`\n📚 Total teachers in database: ${allTeachers.length}`);

    // Separate class and subject teachers
    const classTeachers = await Teacher.find({ role: 'class' });
    const subjectTeachers = await Teacher.find({ role: 'subject' });
    
    console.log(`\n👨‍🏫 Class Teachers: ${classTeachers.length}`);
    console.log(`📖 Subject Teachers: ${subjectTeachers.length}`);

    // Define the 4 subjects (1 for class teacher, 3 for subject teachers)
    const classTeacherSubject = 'Java'; // Class teacher teaches Java
    const subjectTeacherSubjects = ['C', 'Python', 'C++'];

    // Keep only ONE Class Teacher (the first one)
    let classTeacherToKeep = null;
    if (classTeachers.length > 0) {
      classTeacherToKeep = classTeachers[0];
      console.log(`\n✅ Keeping Class Teacher: ${classTeacherToKeep.firstName} ${classTeacherToKeep.lastName} (${classTeacherToKeep.subject})`);
      
      // Delete other class teachers
      for (let i = 1; i < classTeachers.length; i++) {
        const teacher = classTeachers[i];
        console.log(`   🗑️ Deleting extra Class Teacher: ${teacher.firstName} ${teacher.lastName}`);
        
        // Remove from students
        await Student.updateMany(
          { teachers: teacher._id },
          { $pull: { teachers: teacher._id } }
        );
        await Teacher.findByIdAndDelete(teacher._id);
      }
    }

    // Keep only ONE subject teacher per subject (C, Python, C++)
    const teachersToKeep = [];
    const teachersToDelete = [];

    for (const subject of subjectTeacherSubjects) {
      const teachersWithSubject = subjectTeachers.filter(t => t.subject === subject);
      
      if (teachersWithSubject.length > 0) {
        // Keep the first one
        teachersToKeep.push(teachersWithSubject[0]);
        console.log(`\n✅ Keeping Subject Teacher: ${teachersWithSubject[0].firstName} ${teachersWithSubject[0].lastName} (${subject})`);
        
        // Delete duplicates
        for (let i = 1; i < teachersWithSubject.length; i++) {
          teachersToDelete.push(teachersWithSubject[i]);
          console.log(`   🗑️ Deleting duplicate: ${teachersWithSubject[i].firstName} ${teachersWithSubject[i].lastName} (${subject})`);
        }
      } else {
        console.log(`\n⚠️ No Subject Teacher found for: ${subject}`);
        console.log(`   Please create one for ${subject}`);
      }
    }

    // Delete duplicate subject teachers
    for (const teacher of teachersToDelete) {
      await Student.updateMany(
        { teachers: teacher._id },
        { $pull: { teachers: teacher._id } }
      );
      await Teacher.findByIdAndDelete(teacher._id);
    }

    // Now reassign students to the correct teachers
    const finalClassTeacher = classTeacherToKeep;
    const finalSubjectTeachers = await Teacher.find({ 
      role: 'subject', 
      subject: { $in: subjectTeacherSubjects } 
    });

    const approvedStudents = await Student.find({ isApproved: true });
    
    console.log(`\n📚 Reassigning ${approvedStudents.length} students to correct teachers...`);

    for (const student of approvedStudents) {
      // Clear existing teachers
      student.teachers = [];
      
      // Add Class Teacher
      if (finalClassTeacher) {
        student.teachers.push(finalClassTeacher._id);
      }
      
      // Add all Subject Teachers
      for (const teacher of finalSubjectTeachers) {
        student.teachers.push(teacher._id);
      }
      
      await student.save();
      
      // Update teacher's student lists
      if (finalClassTeacher) {
        await Teacher.findByIdAndUpdate(finalClassTeacher._id, { 
          $addToSet: { students: student._id } 
        });
      }
      
      for (const teacher of finalSubjectTeachers) {
        await Teacher.findByIdAndUpdate(teacher._id, { 
          $addToSet: { students: student._id } 
        });
      }
      
      console.log(`   ✅ Updated student: ${student.email} - Now has ${student.teachers.length} teachers`);
    }

    // Display final counts
    const finalClassCount = await Teacher.countDocuments({ role: 'class' });
    const finalSubjectCount = await Teacher.countDocuments({ role: 'subject' });
    
    console.log(`\n🎉 Final Teacher Count:`);
    console.log(`   👨‍🏫 Class Teachers: ${finalClassCount}`);
    console.log(`   📖 Subject Teachers: ${finalSubjectCount}`);
    console.log(`   📚 Total: ${finalClassCount + finalSubjectCount} teachers`);
    console.log(`\n✅ Each student now has ${finalClassCount + finalSubjectCount} teachers (1 Class + ${finalSubjectCount} Subjects)`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixTeachersCount();