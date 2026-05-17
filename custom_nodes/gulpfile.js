const gulp = require('gulp');

gulp.task('build:icons', function () {
	return gulp.src(['nodes/**/*.{png,svg}', 'credentials/**/*.{png,svg}'], { base: '.' })
		.pipe(gulp.dest('dist'));
});
