/**
 * ROT13 encoding/decoding function
 * ROT13 is a simple letter substitution cipher that replaces a letter
 * with the letter 13 places after it in the alphabet.
 * 
 * @param s - The string to encode/decode
 * @returns The ROT13 encoded/decoded string
 */
export function rot13(s: string): string {
  return s.replace(/[A-Z]/gi, (c) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    const rotated = 'NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm'
    const index = alphabet.indexOf(c)
    return index !== -1 ? rotated[index] : c
  })
}

export default rot13

