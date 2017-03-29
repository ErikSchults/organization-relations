const express = require('express');
const bodyParser = require('body-parser');
const bodyParserJsonError = require('express-body-parser-json-error');

const hostname = 'localhost';
const port = 3000;

const pool = require('./database');

const app = express();
app.use(bodyParser.json());
app.use(bodyParserJsonError());

const sortOrganizations = (obj, out={ relations:[], organizations:[] }) => {
	if(obj['daughters']) {
		obj['daughters'].forEach((daughter) => {
			if(!out.relations[obj["org_name"]]) out.relations[obj["org_name"]] = [];
			out.relations[obj["org_name"]].push(daughter["org_name"]);

			// distinct organizations
			if(out.organizations.indexOf(obj["org_name"]) === -1) out.organizations.push(obj["org_name"]);
			if(out.organizations.indexOf(daughter["org_name"]) === -1) out.organizations.push(daughter["org_name"]);

  		if (daughter.hasOwnProperty('daughters')) {
  			sortOrganizations(daughter, out);
  		}
		});
	}
	return out;
}

app.post('/', (req, resp) => {
	var data = sortOrganizations(req.body);
	pool.getConnection().then((conn) => {
		data.organizations.forEach((org) => {
			var post 	= {org_name: org};
			conn.query('INSERT INTO organizations SET ?', post).catch((err) => {
				// allow unique constraint error
				if(err.errno !== 1062) resp.sendStatus(500);
			});
		});
		for(parent in data.relations) {
			for(child in data.relations[parent]) {
				conn.query(`INSERT INTO relations (org_parent, org_child) SELECT
					(SELECT org_id FROM organizations WHERE org_name = ?) AS p, 
					(SELECT org_id FROM organizations WHERE org_name = ?) AS c`, 
						[parent, data.relations[parent][child]]).catch((err) => {
					// allow unique constraint error
					if(err.errno !== 1062) resp.sendStatus(500);
				});
			}
		}
	});
	resp.sendStatus(200);
});


const getRelatives = (fields) => {
	return pool.getConnection().then((conn) => {
		return conn.query(`SELECT org_name, relationship_type FROM (
					SELECT DISTINCT o.org_name, "sister" as relationship_type FROM organizations o
					INNER JOIN relations r ON r.org_child=o.org_id AND o.org_name <> ?
					WHERE r.org_parent IN (SELECT r.org_parent FROM relations r
					INNER JOIN organizations o on r.org_child = o.org_id
					WHERE o.org_name = ?)
					UNION
					SELECT org_name, "daughter" as relationship_type FROM organizations WHERE org_id IN (
					SELECT r.org_child FROM relations r
					INNER JOIN organizations o on r.org_parent = o.org_id
					WHERE o.org_name = ?)
					UNION
					SELECT org_name, "parent" as relationship_type FROM organizations WHERE org_id IN (
					SELECT r.org_parent FROM relations r
					INNER JOIN organizations o on r.org_child = o.org_id
					WHERE o.org_name = ?)
					) as result ORDER BY org_name LIMIT ? OFFSET ?`, fields);
			conn.release()
		}).then(results => results[0]);
};

app.get('/:page', (req, resp) => {
  var org = req.query.org;
  	page = req.params.page;
  	fields = [org, org, org, org, 100*page, 100*page-100];  // looks wierd, but is secure
	
	getRelatives(fields)
		.then((output) => {resp.json(output)})
		.catch((err) => resp.sendStatus(500));
});


app.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});
