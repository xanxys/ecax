// Common utilities for conveting some ECA-related info
// to/from strings.

var patternToString = function(pat) {
	return _.map(pat, function(v) {
		return v ? '1' : '0';
	}).join('');
};

var patternFromString = function(s) {
	return _.map(s, function(v) {
		return v == '1';
	});
};
