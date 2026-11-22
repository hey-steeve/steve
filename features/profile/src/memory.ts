export class PatientMemoryParseError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "PatientMemoryParseError";
    this.path = path;
  }
}

export type Child = {
  readonly givenName: string;
  readonly birthDate: string;
  readonly ageYears: number;
};

export type Identity = {
  readonly givenName: string;
  readonly familyName: string;
  readonly birthDate: string;
  readonly ageYears: number;
  readonly situation: string;
  readonly children: readonly Child[];
};

export type Practitioner = {
  readonly name: string;
  readonly practice: string;
  readonly identifier: string;
  readonly address: string;
};

export type DeclaredNote = {
  readonly kind: "note";
  readonly text: string;
};

export type DeclaredVisit = {
  readonly kind: "visit";
  readonly specialty: string;
  readonly practitioner: Practitioner;
  readonly requestedOn: string;
  readonly seenOn: string;
  readonly waitDays: number;
  readonly reason: string;
};

export type DeclaredEntry = DeclaredNote | DeclaredVisit;

export type CallRecord = {
  readonly at: string;
  readonly direction: "in" | "out";
  readonly summary: string;
};

export type PatientMemory = {
  readonly demo: true;
  readonly asOf: string;
  readonly identity: Identity;
  readonly declaredHistory: readonly DeclaredEntry[];
  readonly preferences: readonly string[];
  readonly callHistory: readonly CallRecord[];
};

const realIdentifier =
  /[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+33|0033|0)[\s.]?[1-9](?:[\s.]?\d{2}){4}|\d{9,}|https?:\/\/|www\./i;

const demoRpps = /^DEMO-RPPS-\d{4}$/;

function fail(path: string, detail: string): never {
  throw new PatientMemoryParseError(path, detail);
}

function join(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readObject(
  value: unknown,
  path: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(path, "expected an object");
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      fail(join(path, key), "unknown field");
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      fail(join(path, key), "missing field");
    }
  }
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "expected text");
  }
  if (realIdentifier.test(value)) {
    fail(path, "looks like a real identifier");
  }
  return value;
}

function readCount(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(path, "expected a whole number");
  }
  return value;
}

function parts(value: string): readonly [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    fail(value, "expected a calendar date");
  }
  return [year, month, day];
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = parts(value);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function readDate(value: unknown, path: string): string {
  const text = readString(value, path);
  if (!isCalendarDate(text)) {
    fail(path, "expected a calendar date");
  }
  return text;
}

function calendarDays(start: string, end: string): number {
  const [startYear, startMonth, startDay] = parts(start);
  const [endYear, endMonth, endDay] = parts(end);
  return (
    (Date.UTC(endYear, endMonth - 1, endDay) -
      Date.UTC(startYear, startMonth - 1, startDay)) /
    86_400_000
  );
}

function completedYears(birthDate: string, on: string): number {
  const [birthYear, birthMonth, birthDay] = parts(birthDate);
  const [onYear, onMonth, onDay] = parts(on);
  let age = onYear - birthYear;
  if (onMonth < birthMonth || (onMonth === birthMonth && onDay < birthDay)) {
    age -= 1;
  }
  return age;
}

function readChild(value: unknown, index: number, asOf: string): Child {
  const path = `identity.children[${index}]`;
  const record = readObject(value, path, [
    "givenName",
    "birthDate",
    "ageYears",
  ]);
  const birthDate = readDate(record["birthDate"], `${path}.birthDate`);
  const ageYears = readCount(record["ageYears"], `${path}.ageYears`);
  if (ageYears !== completedYears(birthDate, asOf)) {
    fail(`${path}.ageYears`, "does not match birthDate at asOf");
  }
  return {
    givenName: readString(record["givenName"], `${path}.givenName`),
    birthDate,
    ageYears,
  };
}

function readChildren(value: unknown, asOf: string): readonly Child[] {
  if (!Array.isArray(value)) {
    fail("identity.children", "expected a list");
  }
  return value.map((child, index) => readChild(child, index, asOf));
}

function readIdentity(value: unknown, asOf: string): Identity {
  const record = readObject(value, "identity", [
    "givenName",
    "familyName",
    "birthDate",
    "ageYears",
    "situation",
    "children",
  ]);
  const birthDate = readDate(record["birthDate"], "identity.birthDate");
  const ageYears = readCount(record["ageYears"], "identity.ageYears");
  if (ageYears !== completedYears(birthDate, asOf)) {
    fail("identity.ageYears", "does not match birthDate at asOf");
  }
  return {
    givenName: readString(record["givenName"], "identity.givenName"),
    familyName: readString(record["familyName"], "identity.familyName"),
    birthDate,
    ageYears,
    situation: readString(record["situation"], "identity.situation"),
    children: readChildren(record["children"], asOf),
  };
}

function readIdentifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !demoRpps.test(value)) {
    fail(path, "expected a DEMO-RPPS placeholder");
  }
  return value;
}

function readPractitioner(value: unknown, path: string): Practitioner {
  const record = readObject(value, path, [
    "name",
    "practice",
    "identifier",
    "address",
  ]);
  return {
    name: readString(record["name"], `${path}.name`),
    practice: readString(record["practice"], `${path}.practice`),
    identifier: readIdentifier(record["identifier"], `${path}.identifier`),
    address: readString(record["address"], `${path}.address`),
  };
}

function readVisit(
  value: Record<string, unknown>,
  path: string,
  asOf: string,
): DeclaredVisit {
  const record = readObject(value, path, [
    "kind",
    "specialty",
    "practitioner",
    "requestedOn",
    "seenOn",
    "waitDays",
    "reason",
  ]);
  const requestedOn = readDate(record["requestedOn"], `${path}.requestedOn`);
  const seenOn = readDate(record["seenOn"], `${path}.seenOn`);
  const waitDays = readCount(record["waitDays"], `${path}.waitDays`);
  if (requestedOn > seenOn) {
    fail(`${path}.seenOn`, "visit is before the request");
  }
  if (seenOn >= asOf) {
    fail(`${path}.seenOn`, "visit is not before asOf");
  }
  if (waitDays !== calendarDays(requestedOn, seenOn)) {
    fail(`${path}.waitDays`, "does not match the dates");
  }
  return {
    kind: "visit",
    specialty: readString(record["specialty"], `${path}.specialty`),
    practitioner: readPractitioner(
      record["practitioner"],
      `${path}.practitioner`,
    ),
    requestedOn,
    seenOn,
    waitDays,
    reason: readString(record["reason"], `${path}.reason`),
  };
}

function readEntry(
  value: unknown,
  index: number,
  asOf: string,
): DeclaredEntry {
  const path = `declaredHistory[${index}]`;
  if (!isRecord(value)) {
    fail(path, "expected an object");
  }
  if (value["kind"] === "note") {
    const record = readObject(value, path, ["kind", "text"]);
    return {
      kind: "note",
      text: readString(record["text"], `${path}.text`),
    };
  }
  if (value["kind"] === "visit") {
    return readVisit(value, path, asOf);
  }
  fail(`${path}.kind`, "expected note or visit");
}

function readHistory(value: unknown, asOf: string): readonly DeclaredEntry[] {
  if (!Array.isArray(value)) {
    fail("declaredHistory", "expected a list");
  }
  const entries = value.map((entry, index) => readEntry(entry, index, asOf));
  const identifiers = entries.flatMap((entry) =>
    entry.kind === "visit" ? [entry.practitioner.identifier] : [],
  );
  if (new Set(identifiers).size !== identifiers.length) {
    fail("declaredHistory", "duplicate practitioner identifier");
  }
  return entries;
}

function readPreferences(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    fail("preferences", "expected a list");
  }
  return value.map((item, index) => readString(item, `preferences[${index}]`));
}

function readDirection(value: unknown, path: string): "in" | "out" {
  if (value === "in" || value === "out") {
    return value;
  }
  fail(path, "expected in or out");
}

function readCall(value: unknown, index: number, asOf: string): CallRecord {
  const path = `callHistory[${index}]`;
  const record = readObject(value, path, ["at", "direction", "summary"]);
  const at = readDate(record["at"], `${path}.at`);
  if (at >= asOf) {
    fail(`${path}.at`, "call is not before asOf");
  }
  return {
    at,
    direction: readDirection(record["direction"], `${path}.direction`),
    summary: readString(record["summary"], `${path}.summary`),
  };
}

function readCalls(value: unknown, asOf: string): readonly CallRecord[] {
  if (!Array.isArray(value)) {
    fail("callHistory", "expected a list");
  }
  return value.map((item, index) => readCall(item, index, asOf));
}

export function parsePatientMemory(input: unknown): PatientMemory {
  const record = readObject(input, "", [
    "demo",
    "asOf",
    "identity",
    "declaredHistory",
    "preferences",
    "callHistory",
  ]);
  if (record["demo"] !== true) {
    fail("demo", "demo must be true");
  }
  const asOf = readDate(record["asOf"], "asOf");
  return {
    demo: true,
    asOf,
    identity: readIdentity(record["identity"], asOf),
    declaredHistory: readHistory(record["declaredHistory"], asOf),
    preferences: readPreferences(record["preferences"]),
    callHistory: readCalls(record["callHistory"], asOf),
  };
}
