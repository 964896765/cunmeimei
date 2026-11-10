'use strict';
// PostgreSQL LIKE/ILIKE uses backslash as the default escape character.
// Interpret user input as a literal substring so '%', '_' and '\\' cannot expand search scope.
const literalSearchPattern=q=>'%'+String(q).replace(/[\\%_]/g,ch=>'\\'+ch)+'%';
module.exports={literalSearchPattern};
