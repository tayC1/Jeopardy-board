// Shared helpers for cleaning trivia text and wrapping a plain answer into
// Jeopardy-style "What/Who is ...?" form.
const PERSON_HINT = /\b(Mr\.|Mrs\.|Ms\.|Dr\.|President|King|Queen|Sir|Saint|St\.)\b/;
const NAME_PATTERN = /^(?:the |a |an )?[A-Z][a-zA-Z.'-]*(?:\s[A-Z][a-zA-Z.'-]*){1,3}$/;

export function sanitizeText(text) {
  return text
    .replace(/\\(?=["'])/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function formatAnswer(rawResponse) {
  const response = sanitizeText(rawResponse);
  const isMultiple = / & | and |, /.test(response);
  const isPerson = PERSON_HINT.test(response) || NAME_PATTERN.test(response);
  const leadIn = isPerson ? (isMultiple ? 'Who are' : 'Who is') : isMultiple ? 'What are' : 'What is';
  return `${leadIn} ${response}?`;
}
