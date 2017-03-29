// get the client
var mysql = require('mysql2/promise');
var pool = mysql.createPool({
	host: 'localhost',
	user: 'root',
	password: '',
	database: 'organization_relationships'
});

module.exports = pool;
