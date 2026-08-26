export interface SlashToken {
  query: string;
  start: number;
  end: number;
}

export function findSlashToken(text: string): SlashToken | null {
  const match = /(^|\s)(\/\S*)$/.exec(text);
  if (!match) return null;
  const token = match[2];
  return {
    query: token.slice(1).toLowerCase(),
    start: match.index + match[1].length,
    end: text.length,
  };
}

export function replaceSlashToken(text: string, token: SlashToken, command: string): string {
  return `${text.slice(0, token.start)}${command} ${text.slice(token.end)}`;
}
