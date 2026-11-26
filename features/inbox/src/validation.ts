import {
  inboxLimits,
  type AppointmentConfirmationClassification,
  type InboxAttachment,
  type InboxProvenance,
  type InboundMessageClassification,
  type NormalizedInboundMessage,
  type ReportClassification,
} from "./contracts.ts";

const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;
const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const mimeTypePattern = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@+-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isBoundedNonBlankString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim().length > 0
  );
}

function containsHeaderControl(value: string): boolean {
  return /[\r\n\0]/.test(value);
}

function isIdentifier(value: unknown, maximum: number): value is string {
  return (
    isBoundedNonBlankString(value, maximum) &&
    !containsHeaderControl(value) &&
    identifierPattern.test(value)
  );
}

export function isEmailAddress(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= inboxLimits.emailAddressCharacters &&
    !containsHeaderControl(value) &&
    emailPattern.test(value)
  );
}

function isHeaderText(value: unknown, maximum: number): value is string {
  return (
    isBoundedNonBlankString(value, maximum) &&
    !containsHeaderControl(value) &&
    !/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}

export function isTimestampWithTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) {
    return false;
  }
  const match = timestampPattern.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    daysInMonth !== undefined &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

function copyUnknownArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    copy.push(value[index]);
  }
  return copy;
}

function parseAttachment(value: unknown): InboxAttachment | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "fileName", "mimeType", "bytes"])
  ) {
    return undefined;
  }

  const id = value["id"];
  const fileName = value["fileName"];
  const mimeType = value["mimeType"];
  const bytes = value["bytes"];

  if (
    !isIdentifier(id, inboxLimits.attachmentIdCharacters) ||
    !isBoundedNonBlankString(fileName, inboxLimits.attachmentFileNameCharacters) ||
    containsHeaderControl(fileName) ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    !isBoundedNonBlankString(mimeType, inboxLimits.attachmentMimeTypeCharacters) ||
    containsHeaderControl(mimeType) ||
    !mimeTypePattern.test(mimeType) ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > inboxLimits.attachmentBytes
  ) {
    return undefined;
  }

  return { id, fileName, mimeType, bytes: new Uint8Array(bytes) };
}

export function parseNormalizedMessage(value: unknown): NormalizedInboundMessage | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "providerMessageId",
      "from",
      "to",
      "subject",
      "textBody",
      "attachments",
      "receivedAt",
    ])
  ) {
    return undefined;
  }

  const providerMessageId = value["providerMessageId"];
  const from = value["from"];
  const to = value["to"];
  const subject = value["subject"];
  const textBody = value["textBody"];
  const receivedAt = value["receivedAt"];
  const rawAttachments = copyUnknownArray(value["attachments"]);

  if (
    !isIdentifier(providerMessageId, inboxLimits.providerMessageIdCharacters) ||
    !isEmailAddress(from) ||
    !isEmailAddress(to) ||
    !isHeaderText(subject, inboxLimits.subjectCharacters) ||
    (textBody !== undefined &&
      (typeof textBody !== "string" || textBody.length > inboxLimits.textBodyCharacters)) ||
    !isTimestampWithTimezone(receivedAt) ||
    rawAttachments === undefined ||
    rawAttachments.length > inboxLimits.attachmentCount
  ) {
    return undefined;
  }

  const attachments: InboxAttachment[] = [];
  const attachmentIds = new Set<string>();
  let totalBytes = 0;
  for (const rawAttachment of rawAttachments) {
    const attachment = parseAttachment(rawAttachment);
    if (attachment === undefined || attachmentIds.has(attachment.id)) {
      return undefined;
    }
    attachmentIds.add(attachment.id);
    totalBytes += attachment.bytes.byteLength;
    if (totalBytes > inboxLimits.totalAttachmentBytes) {
      return undefined;
    }
    attachments.push(attachment);
  }

  const snapshot = {
    providerMessageId,
    from,
    to,
    subject,
    attachments,
    receivedAt,
  };
  return textBody === undefined ? snapshot : { ...snapshot, textBody };
}

function parseAppointmentClassification(
  value: Record<string, unknown>,
): AppointmentConfirmationClassification | undefined {
  if (
    !hasOnlyKeys(value, [
      "type",
      "reference",
      "startsAt",
      "endsAt",
      "practitionerName",
    ])
  ) {
    return undefined;
  }
  const reference = value["reference"];
  const startsAt = value["startsAt"];
  const endsAt = value["endsAt"];
  const practitionerName = value["practitionerName"];
  if (
    !isBoundedNonBlankString(reference, inboxLimits.confirmationReferenceCharacters) ||
    containsHeaderControl(reference) ||
    !isTimestampWithTimezone(startsAt) ||
    !isTimestampWithTimezone(endsAt) ||
    Date.parse(endsAt) <= Date.parse(startsAt) ||
    (practitionerName !== undefined &&
      (!isBoundedNonBlankString(
        practitionerName,
        inboxLimits.practitionerNameCharacters,
      ) ||
        containsHeaderControl(practitionerName)))
  ) {
    return undefined;
  }
  const result = { type: "appointment-confirmation" as const, reference, startsAt, endsAt };
  return practitionerName === undefined ? result : { ...result, practitionerName };
}

function parseReportClassification(
  value: Record<string, unknown>,
  message: NormalizedInboundMessage,
): ReportClassification | undefined {
  if (!hasOnlyKeys(value, ["type", "attachmentIds"])) {
    return undefined;
  }
  const rawIds = copyUnknownArray(value["attachmentIds"]);
  if (rawIds === undefined || rawIds.length === 0 || rawIds.length > inboxLimits.attachmentCount) {
    return undefined;
  }
  const availableIds = new Set(message.attachments.map((attachment) => attachment.id));
  const attachmentIds: string[] = [];
  const seenIds = new Set<string>();
  for (const rawId of rawIds) {
    if (
      !isIdentifier(rawId, inboxLimits.attachmentIdCharacters) ||
      !availableIds.has(rawId) ||
      seenIds.has(rawId)
    ) {
      return undefined;
    }
    seenIds.add(rawId);
    attachmentIds.push(rawId);
  }
  return { type: "report", attachmentIds };
}

export function parseClassification(
  value: unknown,
  message: NormalizedInboundMessage,
): InboundMessageClassification | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const type = value["type"];
  if (type === "appointment-confirmation") {
    return parseAppointmentClassification(value);
  }
  if (type === "report") {
    return parseReportClassification(value, message);
  }
  if (type === "unsupported" && hasOnlyKeys(value, ["type"])) {
    return { type: "unsupported" };
  }
  return undefined;
}

export function copyMessage(message: NormalizedInboundMessage): NormalizedInboundMessage {
  const attachments = message.attachments.map((attachment) => ({
    ...attachment,
    bytes: new Uint8Array(attachment.bytes),
  }));
  const copy = {
    providerMessageId: message.providerMessageId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    attachments,
    receivedAt: message.receivedAt,
  };
  return message.textBody === undefined ? copy : { ...copy, textBody: message.textBody };
}

export function provenanceOf(message: NormalizedInboundMessage): InboxProvenance {
  return {
    providerMessageId: message.providerMessageId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    receivedAt: message.receivedAt,
  };
}
