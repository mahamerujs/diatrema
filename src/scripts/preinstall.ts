if (process.env.npm_config_global === 'true' || process.env.npm_config_global === '1') {
    console.error('\x1b[31m%s\x1b[0m', '==================================================================');
    console.error('\x1b[31m%s\x1b[0m', ` Error: The "${process.env.npm_package_name}" package cannot be installed globally!`);
    console.error('\x1b[31m%s\x1b[0m', ' Please install it locally within your project using:');
    console.error('\x1b[33m%s\x1b[0m', ` npm install ${process.env.npm_package_name}`);
    console.error('\x1b[31m%s\x1b[0m', '==================================================================');

    process.exit(1);
}
