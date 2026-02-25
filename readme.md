<img width="605" height="179" alt="image" src="https://github.com/user-attachments/assets/80eff050-d5fd-41b2-a6a1-5c338a03fb25" />


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
