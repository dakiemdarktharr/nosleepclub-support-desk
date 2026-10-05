import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const employeeRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.string().regex(/^\d{2}$/),
  title: z.string().min(1),
  department: z.string().min(1),
});

export type Employee = {
  id: string;
  name: string;
  level: number;
  title: string;
  department: string;
};

import { generateEmployeeId } from "./identity";
export { generateEmployeeId } from "./identity";

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];

    if (character === '"' && row[index + 1] === '"' && insideQuotes) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      insideQuotes = !insideQuotes;
    } else if (character === "," && !insideQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  if (insideQuotes) {
    throw new Error("Employee CSV contains an unterminated quoted field.");
  }

  values.push(value.trim());
  return values;
}

/** Validates legacy synthetic fixtures for controlled seed/import; never used for runtime accounts. */
export function getEmployees(): Employee[] {
  const csvPath = path.join(process.cwd(), "data", "employees.csv");
  const csv = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = csv.split(/\r?\n/).filter((row) => row.trim().length > 0);
  const expectedHeaders = ["id", "name", "level", "title", "department"];
  const headers = rows[0] ? parseCsvRow(rows[0]) : [];

  if (headers.join(",") !== expectedHeaders.join(",")) {
    throw new Error("Employee CSV headers do not match the required columns.");
  }

  const employees = rows.slice(1).map((row, index) => {
    const columns = parseCsvRow(row);
    if (columns.length !== expectedHeaders.length) {
      throw new Error(`Employee CSV row ${index + 2} has an invalid column count.`);
    }

    const parsedRow = employeeRowSchema.parse(
      Object.fromEntries(expectedHeaders.map((header, column) => [header, columns[column]])),
    );
    const level = Number(parsedRow.level);
    if (level > 36) {
      throw new Error(`Employee CSV row ${index + 2} has an invalid authority level.`);
    }

    const generatedId = generateEmployeeId(parsedRow.name);
    if (parsedRow.id !== generatedId) {
      throw new Error(`Employee CSV row ${index + 2} has an ID that does not match its name.`);
    }

    return { ...parsedRow, level };
  });

  const ids = employees.map((employee) => employee.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Employee CSV contains duplicate IDs.");
  }

  return employees;
}
