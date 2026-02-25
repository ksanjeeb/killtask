<img width="2080" height="732" alt="image" src="https://github.com/user-attachments/assets/625385e1-14be-4795-88a2-28811edb2346" />


# killtask

CLI to kill processes running on specific ports.

## Usage

Kill a single port:

```
npx killtask 8080
```

Kill multiple ports:

```
npx killtask 8080 3000
```

Kill all listening ports:

```
npx killtask --all
```


## Options

* `--all` – Kill all listening ports
* `--help` – Show help
* `--version` – Show version


