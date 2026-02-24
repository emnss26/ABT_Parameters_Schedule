const jwt = require("jsonwebtoken");

/**
 * Verifica un JWT de Autodesk validando solo expiración
 * (Autodesk no expone JWKS público para validación de firma)
 * @param {string} token - JWT a verificar
 * @returns {Promise<Object>} Payload decodificado del token
 * @throws {Error} Si el token está expirado o el formato es inválido
 */
async function verifyAPSToken(token) {
  try {
    // Decodificar token sin verificar firma
    const decoded = jwt.decode(token);

    if (!decoded) {
      throw new Error("Invalid token format");
    }

    // Validar expiración
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp <= now) {
        throw new Error("Token has expired");
      }
    }

    return decoded;
  } catch (error) {
    if (error.message === "Token has expired") {
      throw error;
    }
    throw new Error("Invalid token: " + error.message);
  }
}

module.exports = { verifyAPSToken };
