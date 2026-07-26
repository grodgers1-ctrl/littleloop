// Validation helpers shared by setup and settings forms.

import {
  isFutureDate,
  isValidChildName,
  isValidDateOnly,
} from "./dates";

export interface SetupValidation {
  childName?: string;
  dateOfBirth?: string;
}

export function validateSetup(input: {
  childName: string;
  dateOfBirth: string;
}): SetupValidation {
  const errors: SetupValidation = {};
  if (!isValidChildName(input.childName)) {
    errors.childName = "Please enter a name between 1 and 60 characters.";
  }
  if (!isValidDateOnly(input.dateOfBirth)) {
    errors.dateOfBirth = "Please enter a valid date.";
  } else if (isFutureDate(input.dateOfBirth)) {
    errors.dateOfBirth = "Date of birth cannot be in the future.";
  } else if (parseInt(input.dateOfBirth.slice(0, 4), 10) < 1990) {
    errors.dateOfBirth = "Please enter a realistic year.";
  }
  return errors;
}

export function hasErrors(errors: SetupValidation): boolean {
  return Boolean(errors.childName || errors.dateOfBirth);
}