#!/usr/bin/env node

import commandprompt from 'command-prompt'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { stdin, stdout } from 'process'
import { setTimeout } from 'timers/promises'
import commander from 'commander'
import chalk from 'chalk'
import figlet from 'figlet'
import terminalKit from 'terminal-kit'
import clone from 'git-clone'
import {deleteAsync} from 'del'
import ipvalidator from 'ip-validator'
import { OpenVPN } from 'openvpn-cli-wrapper'
import psaux from 'psaux'
import ora, { promise } from 'ora'
import { time } from 'console'
import isonline from 'is-online'
import { spawn, exec } from 'child_process'
import inquirerSelect from 'inquirer-select-directory'

inquirer.registerPrompt('directory', inquirerSelect)

const commandPrompt = commandprompt.default
const program = new commander.Command()
const log = console.log
const term = terminalKit.terminal

process.on('SIGINT', function () {
  //log(chalk.redBright('\nGraceful shutdown.'))

  process.exit()
})

program.option('-n, --name <project_name>', 'string argument')
program.parse()
const options = program.opts();
if (options.verbose > 0) console.log(`verbosity: ${options.verbose}`);
if (options.name !== undefined) console.log(options.name);

if (process.platform !== 'linux') {
  console.error(chalk.red(`This cli app is currently only compatible with Linux. Your OS: ${process.platform}`))
  process.exit(1)
}

//BANNER
log(chalk.greenBright(figlet.textSync('ESP IDF CXX', {
  font: 'Electronic',
  horizontalLayout: 'default',
  verticalLayout: 'default',
  //width: 80,
  //whitespaceBreak: false
})))

stdout.write(chalk.green('esp-idf:') + chalk.blue('~') + chalk.white('# '))
/*await slowTyping*/log(chalk.greenBright('initializing C++ project...'))//, 25)
//log()


log()
commandPrompt({
  name: chalk.cyanBright('How may I help you?'),
  choices: [
    {
      name: 'Create a new C++ project',
      async method() {
        try {
          const machineData = await inquirer.prompt([
            {
              type: 'input',
              message: chalk.cyanBright('Name of the project (dir name):'),
              name: 'name',
              validate: function (name) {
                return name.trim().length > 0 && !name.includes('/')
              }
            },
            {
              type: 'input',
              message: chalk.cyanBright('Short description:'),
              name: 'description'
            }
          ])

          const name = machineData.name.trimStart().trimEnd()
          const dir = `./${name}`
          let shouldCreateDir = false
          try {
            await fs.promises.access(dir)

            const existsPrompt = await inquirer.prompt([
              {
                type: 'confirm',
                message: chalk.redBright(`Directory ${prettyPath(dir)} already exists. Delete directory and create a new project?`),
                name: 'deleteDir',
                default: true
              }
            ])

            try {
              if (existsPrompt.deleteDir) {
                await promiseSpinner(`Deleting ${prettyPath(dir)}`,
                  fs.promises.rm(dir, {recursive: true}),
                  `Deleted ${prettyPath(dir)}`)

                shouldCreateDir = true
              }

            } catch (error) {
              log(chalk.redBright(`Error while trying to delete ${prettyPath(dir)}: ${error}`))
            }
          } catch (error) {
            if (error.errno !== -2) {
              log(chalk.redBright(`Error while checking access of ${prettyPath(dir)}: ${error} Aborting`))
              process.exit(1)
            }
            shouldCreateDir = true
          }

          //create dir
          if (shouldCreateDir) {
            await promiseSpinner(`Creating ${prettyPath(dir)}`, fs.promises.mkdir(dir), `Created ${prettyPath(dir)}`)
          }

          await promiseSpinner(`Cloning CXX example project`, pClone('https://github.com/SinanAkkoyun/esp-idf-cpp-example', dir), `Cloned CXX example project`)

          await promiseSpinner(`Preparing ${prettyPath(dir)}`, new Promise(async (res, rej) => {
            try {
              await fs.promises.rm(`${dir}/.git`, {recursive: true})
              await fs.promises.rm(`${dir}/sdkconfig`, {recursive: true})
              await fs.promises.rm(`${dir}/sdkconfig.old`, {recursive: true})
              res()
            } catch(e) { rej(e) }
          }), `Preparation done`)

          log(chalk.greenBright('Done! Your project is now configured! ' ) + chalk.gray(prettyPath(dir)))

        } catch (error) {
          log(chalk.red(error + '\nPlease report to author.'))
        }
      }
    },
    {
      name: 'Create a new C++ component',
      choices: [
        {
          name: 'clone project',
          method() {
            console.log('git clone.....');
          }
        },
        {
          name: 'fetch project',
          method() {
            console.log('git fetch.....');
          }
        }
      ]
    },
    {
      name: 'Select example and convert to C++',
      choices: [
        {
          name: 'clone project',
          method() {
            console.log('git clone.....');
          }
        },
        {
          name: 'fetch project',
          method() {
            console.log('git fetch.....');
          }
        }
      ]
    },
    {
      name: 'Convert existing C project to C++',
        async method() {
          // Add test check if dir is actually IDF project
          // TEST

          const existingProjectPath = await inquirer.prompt([
            {
              type: 'directory',
              name: 'dir',
              message: chalk.cyanBright('Choose your existing project'),
              basePath: '.'
            }
          ])
          const dir = existingProjectPath.dir

          const shouldMakeCXX = await inquirer.prompt([
            {
              type: 'confirm',
              message: chalk.greenBright(`Do you wanna make ${existingProjectPath.dir} C++ ready?`),
              name: 'cxxReady',
              default: true
            }
          ])

          if(shouldMakeCXX) {
            await promiseSpinner(`Editing CMakeLists.txt`, new Promise(async (res, rej) => {
              try {
                // edit first CMakeLists.txt
                const firstCMake = (await fs.promises.readFile(`${dir}/CMakeLists.txt`)).toString()
                const splitFirstCMake = firstCMake.split('\n')
                for(let i=0;i<splitFirstCMake.length;i++) {
                  if(splitFirstCMake[i].includes('cmake_minimum_required')) {
                    splitFirstCMake[i] = 'cmake_minimum_required(VERSION 3.8)'

                    if(!splitFirstCMake[i+1].includes('set(EXTRA_COMPONENT_DIRS')) {
                      splitFirstCMake.splice(i+1, 0, '# only set if u dont use main but other dir hierarchy structure:\nset(EXTRA_COMPONENT_DIRS main)')
                    }
                    if(!splitFirstCMake.join('\n').includes('set(CMAKE_CXX_STANDARD')) {
                      splitFirstCMake.splice(i+1, 0, 'set(CMAKE_CXX_STANDARD 17)')
                    }
                    
                  }
                  //if(splitFirstCMake[i].includes('include($ENV') && i+1 <= splitFirstCMake.length) {
                    
                  //}
                }
                await fs.promises.writeFile(`${dir}/CMakeLists.txt`, splitFirstCMake.join('\n'))

                //edit settings.json
                let settings = (await fs.promises.readFile(`${dir}/.vscode/settings.json`)).toString()
                /*const settingsSplit = settings.split('\n')
                for(let i=0;i<settingsSplit.length;i++) {
                  if(settingsSplit[i].includes('C_Cpp.intelliSenseEngine')) {
                    settingsSplit[i] = settingsSplit[i].includes(',') ? ',' : ''
                  }
                }
                settingsSplit.splice(1, 0, `*/

                // completely replace
                settings = `
{
  "files.associations": {
    "iostream": "cpp",
    "array": "cpp",
    "atomic": "cpp",
    "strstream": "cpp",
    "bit": "cpp",
    "*.tcc": "cpp",
    "bitset": "cpp",
    "cctype": "cpp",
    "chrono": "cpp",
    "clocale": "cpp",
    "cmath": "cpp",
    "codecvt": "cpp",
    "compare": "cpp",
    "concepts": "cpp",
    "condition_variable": "cpp",
    "csignal": "cpp",
    "cstdarg": "cpp",
    "cstddef": "cpp",
    "cstdint": "cpp",
    "cstdio": "cpp",
    "cstdlib": "cpp",
    "cstring": "cpp",
    "ctime": "cpp",
    "cwchar": "cpp",
    "cwctype": "cpp",
    "deque": "cpp",
    "list": "cpp",
    "map": "cpp",
    "set": "cpp",
    "string": "cpp",
    "unordered_map": "cpp",
    "vector": "cpp",
    "exception": "cpp",
    "algorithm": "cpp",
    "functional": "cpp",
    "iterator": "cpp",
    "memory": "cpp",
    "memory_resource": "cpp",
    "numeric": "cpp",
    "random": "cpp",
    "ratio": "cpp",
    "regex": "cpp",
    "string_view": "cpp",
    "system_error": "cpp",
    "tuple": "cpp",
    "type_traits": "cpp",
    "utility": "cpp",
    "fstream": "cpp",
    "future": "cpp",
    "initializer_list": "cpp",
    "iomanip": "cpp",
    "iosfwd": "cpp",
    "istream": "cpp",
    "limits": "cpp",
    "mutex": "cpp",
    "new": "cpp",
    "numbers": "cpp",
    "ostream": "cpp",
    "semaphore": "cpp",
    "sstream": "cpp",
    "stdexcept": "cpp",
    "stop_token": "cpp",
    "streambuf": "cpp",
    "thread": "cpp",
    "cinttypes": "cpp",
    "typeinfo": "cpp"
  }
}
                `
                await fs.promises.writeFile(`${dir}/.vscode/settings.json`, settings)

                //edit c_cpp_properties.json
                const properties = JSON.parse(await fs.promises.readFile(`${dir}/.vscode/c_cpp_properties.json`))
                properties.configurations[0].compileCommands = '${workspaceFolder}/build/compile_commands.json'
                properties.configurations[0].configurationProvider = 'ms-vscode.makefile-tools'
                await fs.promises.writeFile(`${dir}/.vscode/c_cpp_properties.json`, JSON.stringify(properties, null, 2))

                res()
              } catch(e) { rej(e) }
            }), `Done editing CMakeLists.txt`)
          }
        }
    },
    {
      name: chalk.gray('exit'),
      method: () => process.exit()
    }
  ]
})

async function slowTyping(text, speed = 50, randomSpeed = false, newline = true) {
  let tmpText = text
  let abort = false
  let finished = false

  process.stdin.setRawMode(true)
  process.stdin.once('data', () => {
    if (!finished) {
      abort = true
      process.stdin.setRawMode(false)
    }
  })

  while (tmpText.length > 0 && !abort) {
    let colorText = tmpText.match(/^\x1b\[[0-9;]*m/)//tmpText.match(/^\033\[[0-9;]+m/)
    if (colorText && colorText[0]) {
      process.stdout.write(tmpText.slice(0, colorText[0].length))
      tmpText = tmpText.slice(colorText[0].length, tmpText.length)
    }

    process.stdout.write(tmpText.slice(0, 1))
    await setTimeout((randomSpeed ? 0.2 + Math.random() * 1.8 : 1) * speed)
    tmpText = tmpText.slice(1, tmpText.length)
  }
  if (abort)
    process.stdout.write(tmpText)

  if (newline)
    process.stdout.write('\n')

  finished = true
  process.stdin.setRawMode(false)
  return
}

async function promiseSpinner(text, promise, successText) {
  const spinner = ora(text).start()

  try {
    await promise
    if (successText)
      spinner.text = successText
    spinner.succeed()
  } catch (error) {
    spinner.fail()
    log(chalk.redBright(error))
  }
}

function prettyPath(dir) {
  return path.resolve(dir).replace(/\/home\/[a-zA-Z0-9_.-]*\//, '~/')
}

function pClone(path, dir) {
  return new Promise((res, rej) => {
    clone(path, dir, undefined, (err) => {
      if(err)
        rej(err)

      res()
    })
  })
}

const execute = (cmd) => new Promise((res, rej) => {
  exec(cmd, { shell: true }, (err, stdout, stderr) => {
    if (err) {
      rej(err)
    }
    res(stdout)
  })
})

//ADD HTBSTOP for openvpn etc
