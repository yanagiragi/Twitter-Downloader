module.exports = {
	"env": {
		"node": true,
		"commonjs": true,
		"es2021": true
	},
	"extends": "eslint:recommended",
	"parserOptions": {
		"ecmaVersion": 12
	},
	"rules": {
		"indent": ["error", "space", { "SwitchCase": 1 }],
		"no-tabs": 0,
		"quotes": ["error", "single"],
		"semi": ["error", "never"],
		"no-unused-vars": "off"
	}
};
