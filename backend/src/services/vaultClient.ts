/**
 * vaultClient — cifrado de la trama A→B con Vault Transit (KMS).
 *
 * Mínimo privilegio: el token de este backend (VAULT_TOKEN) SOLO puede
 * cifrar con la key `certifications-key` (transit/encrypt/...); el descifrado
 * es exclusivo del Sistema B. Nunca se manipula material de clave localmente.
 */

import { config } from '../config';

/**
 * Cifra un texto plano con Vault Transit y devuelve el ciphertext
 * (formato `vault:vN:...`). Lanza con mensajes claros si Vault no está
 * configurado o rechaza la operación.
 */
export async function encryptWithTransit(plaintext: string): Promise<string> {
  if (!config.vault.addr) {
    throw new Error('VAULT_ADDR no configurado: no se puede cifrar la trama A→B.');
  }
  if (!config.vault.token) {
    throw new Error('VAULT_TOKEN no configurado: no se puede cifrar la trama A→B.');
  }

  const url = `${config.vault.addr}/v1/transit/encrypt/${config.vault.transitKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Vault-Token': config.vault.token,
      'Content-Type': 'application/json',
    },
    // Transit exige el plaintext en base64.
    body: JSON.stringify({ plaintext: Buffer.from(plaintext, 'utf8').toString('base64') }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Vault Transit encrypt falló (${res.status}) en ${config.vault.transitKey}: ${body || res.statusText}`,
    );
  }

  const data = (await res.json()) as { data?: { ciphertext?: string } };
  const ciphertext = data.data?.ciphertext;
  if (!ciphertext) {
    throw new Error('Vault Transit no devolvió ciphertext en la respuesta.');
  }
  return ciphertext;
}
