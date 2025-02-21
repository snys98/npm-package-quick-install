const vscode = require('vscode');
const commandExists = require('command-exists');
const { exec } = require('child_process');
const fs = require('fs');
const editor = vscode.window.activeTextEditor;
const pkgUp = require('pkg-up');
const path = require('path');

function customStatusBar(text, color = 'white') {
  let statusBarItem;
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  statusBarItem.text = text;
  statusBarItem.priority = 10000;
  statusBarItem.color = color;
  statusBarItem.show();
  return statusBarItem;
}

function getAllPackages(packageJsonPath) {
  if (packageJsonPath === null) {
    packageJsonPath = vscode.window.activeTextEditor.document.fileName.toString();
  }
  delete require.cache[packageJsonPath];
  const packageJson = require(packageJsonPath);

  return Object.keys(packageJson.dependencies || {}).concat(
    Object.keys(packageJson.devDependencies || {})
  );
}

function getCurrentLineText() {
  const activeLine = vscode.window.activeTextEditor.selection.active.line;
  const textRange = new vscode.Range(activeLine, 0, activeLine + 1, 0);
  return vscode.window.activeTextEditor.document.getText(textRange);
}

function getCurrentSelectText() {
  let activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    let selection = activeEditor.selection;
    let text = activeEditor.document.getText(selection);
    return text;
  }
  return "";
}

function getPackageNameJson() {
  const currentLine = getCurrentLineText();
  const selectedPackage = currentLine.split('"')[1];
  return {
    selectedPackage
  };
}

function getPackageNameRequire() {
  const currentLine = getCurrentLineText();
  let selectedPackage = currentLine.match(/require\(\'(.*)\'\)/);
  if (!selectedPackage || (selectedPackage && selectedPackage.length < 2)) {
    selectedPackage = currentLine.match(
      /(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'\s]*([@\w_/-]+)["'\s]*;?/
    )[2];
  } else {
    selectedPackage = selectedPackage[1];
  }

  return selectedPackage;
}

function managePackage(handle, selectedPackage, packageSrc, isDev) {
  vscode.window.showInformationMessage(`Installing package "${selectedPackage}" to ${isDev ? "devDependencies" : "dependencies"}...`);
  const install = handle === 'install';
  pkgUp({ cwd: packageSrc })
    .then(folder => {
      const allPackages = getAllPackages(folder);
      if (
        install
          ? allPackages.includes(selectedPackage)
          : !allPackages.includes(selectedPackage)
      ) {
        if (install) {
          vscode.window.showErrorMessage('The package is already installed');
        } else {
          vscode.window.showErrorMessage(
            'The package is not your dependencies'
          );
        }
        return;
      }

      const currentFolder = path.dirname(folder);

      const statusStarting = customStatusBar(
        `$(trashcan) ${selectedPackage} is ${install
          ? 'installing'
          : 'removing'}...`,
        'yellow'
      );

      commandExists('yarn')
        .then(() => {
          fs.access(currentFolder + '/yarn.lock', fs.F_OK, async err => {
            let child;
            if (!err) {
              child = await exec(
                `yarn ${install
                  ? isDev ? 'add --dev' : 'add'
                  : 'remove'} ${selectedPackage}`,
                {
                  cwd: currentFolder
                }
              );
            } else {
              child = await exec(
                `npm ${install
                  ? isDev ? 'install --save-dev' : 'install --save'
                  : 'uninstall'} ${selectedPackage}`,
                {
                  cwd: currentFolder
                }
              );
            }

            child.stdout.on('close', data => {
              statusStarting.dispose();
              const statusDone = vscode.window.showInformationMessage(
                `"${selectedPackage}" ${install
                  ? 'has been installed!'
                  : 'has been removed!'}`
              );
              setTimeout(() => {
                statusDone.dispose();
              }, 3000);
              child.kill();
            });
          });
        })
        .catch(async () => {
          const child = await exec(
            `npm ${install
              ? isDev ? 'install --save-dev' : 'install --save'
              : 'uninstall'} ${selectedPackage}`,
            {
              cwd: currentFolder
            }
          );
          child.stdout.on('close', data => {
            customStatusBar(
              `${selectedPackage} ${install
                ? 'has been installed!'
                : 'has been removed!'}`,
              '#7fff59'
            );
            child.kill();
          });
        });
    })
    .catch(console.log);
}

function installPackage(isDev = false) {
  if (/package\.json$/.test(vscode.window.activeTextEditor.document.fileName)) {
    const selectedPackage = getCurrentSelectText();
    managePackage(
      'install',
      selectedPackage,
      path.dirname(vscode.window.activeTextEditor.document.fileName),
      isDev
    );
  } else {
    try {
      const selectedPackage = getCurrentSelectText();
      managePackage(
        'install',
        selectedPackage,
        path.dirname(vscode.window.activeTextEditor.document.fileName),
        isDev
      );
    } catch (error) {
      console.log(error);
    }
  }
}

function activate(context) {
  vscode.commands.registerCommand('extension.installPackage', () => {
    console.log('installPackage');
    installPackage()
  });
  vscode.commands.registerCommand('extension.installDevPackage', () => {
    console.log('installDevPackage');
    installPackage(true)
  }
  );

  vscode.commands.registerCommand('extension.removePackage', () => {
    if (
      /package\.json$/.test(vscode.window.activeTextEditor.document.fileName)
    ) {
      const { selectedPackage } = getPackageNameJson();
      managePackage(
        'remove',
        selectedPackage,
        path.dirname(vscode.window.activeTextEditor.document.fileName)
      );
    } else {
      try {
        const selectedPackage = getPackageNameRequire();
        managePackage(
          'remove',
          selectedPackage,
          path.dirname(vscode.window.activeTextEditor.document.fileName)
        );
      } catch (error) {
        console.log(error);
      }
    }
  });
}

exports.activate = activate;

function deactivate() { }
exports.deactivate = deactivate;
