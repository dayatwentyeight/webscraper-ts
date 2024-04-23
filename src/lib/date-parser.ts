import { parse, format } from 'date-fns';

export function parseAndFormatDate(dateStr: string, currentFormat: string, desiredFormat: string): string {
  const parsedDate = parse(dateStr, currentFormat, new Date());
  return format(parsedDate, desiredFormat);
}

export function extractDatetimeString(str: string): string {
  const re = /\d{4}[-.][0-1]\d[-.][0-3]\d([T\s][0-2]\d:[0-5]\d:[0-5]\d)?([T\s][0-2]\d:[0-5]\d)?/;

  if (!re.test(str)) {
    throw new Error('Cannot find datetime string.');
  }

  return re.exec(str)[0];
}