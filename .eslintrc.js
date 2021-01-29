module.exports = {
	"env": {
		"browser": true,
		"commonjs": true,
		"es6": true,
		"node": true
	},
    "parserOptions": {
        "ecmaVersion": 8,
        "sourceType": "module"
    },
	"extends": "standard",
	"plugins": [],
	"rules": {
		"indent": ["error", "tab", {"SwitchCase": 1}],
		"no-tabs": 0,
		"quotes": ["error", "single"],
		"semi": ["error", "never"],
		"no-unused-vars": "off"
	}
};
