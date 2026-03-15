import fs from 'fs';
import path from 'path';
import Papa, { ParseResult } from 'papaparse'; // <-- CHANGED THIS LINE
import { Question } from '../types';

const csvFilePath = path.join(__dirname, '..', '..', 'data', 'questions.csv');
const jsonFilePath = path.join(__dirname, '..', 'lib', 'questions.json');
const fileContent = fs.readFileSync(csvFilePath, 'utf8');

console.log('Starting CSV import...');

Papa.parse(fileContent, {
  header: true,
  skipEmptyLines: true,
  //                                      vvv ADDED TYPE ANNOTATION HERE vvv
  complete: (results: ParseResult<any>) => {
    if (results.errors.length > 0) {
      console.error('Errors parsing CSV:', results.errors);
      return;
    }

    const questions: Question[] = results.data.map((row: any) => ({
      id: parseInt(row.id, 10),
      question: row.question,
      options: [
        { id: 'A', text: row.optionA },
        { id: 'B', text: row.optionB },
        { id: 'C', text: row.optionC },
        { id: 'D', text: row.optionD },
      ],
      correctAnswer: row.correctAnswer,
      explanation: row.explanation,
      category: row.category,
      difficulty: row.difficulty,
    }));

    fs.writeFileSync(jsonFilePath, JSON.stringify(questions, null, 2));
    console.log(`✅ ${questions.length} questions imported and JSON file created successfully.`);
  },
});
