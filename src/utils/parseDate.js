/**
 * Shared date-parsing utility
 * Accepts: YYYY-MM-DD, DD-MM-YYYY, or ISO string
 * @param {string} dateString
 * @returns {Date|null}
 */
export const parseDate = (dateString) => {
  if (!dateString) return null;

  // Try parsing as ISO date first
  let date = new Date(dateString);

  // Check if date is valid
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try parsing DD-MM-YYYY format
  const ddmmyyyyPattern = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = dateString.match(ddmmyyyyPattern);

  if (match) {
    const [, day, month, year] = match;
    date = new Date(year, month - 1, day);

    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date(dateString);
};

/**
 * Validate a MongoDB ObjectId string
 * @param {string} id
 * @returns {boolean}
 */
export const isValidObjectId = (id) =>
  typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
