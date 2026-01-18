import os


def read_ignore_list(folder_path):
    """
    Read the pathignore.txt file and return a set of ignored file and folder names.
    """
    ignore_file = os.path.join(
        folder_path, "pathignore.txt"
    )  # Updated to use pathignore.txt
    print(f"Looking for pathignore file at: {ignore_file}")  # Debug log

    if os.path.exists(ignore_file):
        try:
            with open(ignore_file, "r", encoding="utf-8") as f:
                ignore_list = set(line.strip() for line in f if line.strip())
                print(f"Loaded ignore list: {ignore_list}")  # Debug log
                return ignore_list
        except Exception as e:
            print(f"Error reading pathignore file: {e}")
    else:
        print("pathignore file not found.")  # Debug log
    return set()


def write_project_structure(folder_path, output_file):
    """
    Write the project structure to an output file, excluding ignored files and folders.
    """
    try:
        # Read the ignore list
        ignore_list = read_ignore_list(folder_path)

        with open(output_file, "w", encoding="utf-8") as f:
            for root, dirs, files in os.walk(folder_path):
                # Filter out ignored directories by name
                original_dirs = list(dirs)
                dirs[:] = [d for d in dirs if d not in ignore_list]
                filtered_dirs = set(original_dirs) - set(dirs)
                if filtered_dirs:
                    print(f"Skipped directories: {filtered_dirs} in {root}")

                # Get the base name of the current directory
                folder_name = os.path.basename(root)

                # Skip the current directory if its name is in the ignore list
                if folder_name in ignore_list:
                    print(f"Skipping folder: {folder_name}")
                    continue

                # Calculate the indentation level based on the folder depth
                level = root.replace(folder_path, "").count(os.sep)
                indent = "    " * level

                f.write(f"{indent}Folder: {folder_name}\n")

                # List all files in the directory
                for file in files:
                    # Match files only by name (ignore type/extension)
                    file_name = os.path.splitext(file)[
                        0
                    ]  # Get file name without extension
                    if file_name in ignore_list:
                        print(f"Skipping file: {file} in {root}")
                        continue

                    file_path = os.path.join(root, file)

                    # Write the file structure
                    file_indent = "    " * (level + 1)
                    f.write(f"{file_indent}File: {file}\n")

                    # Write the content of the file
                    try:
                        with open(file_path, "r", encoding="utf-8") as file_content:
                            content = file_content.read()
                        content_indent = "    " * (level + 2)
                        f.write(f"{content_indent}Code:\n")
                        for line in content.splitlines():
                            f.write(f"{content_indent}{line}\n")
                    except Exception as e:
                        print(f"Could not read file {file}: {e}")
                        f.write(f"{file_indent}    [Could not read file: {e}]\n")

                f.write("\n")

        print(f"Project structure successfully written to '{output_file}'.")
    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    folder_path = input("Enter the path to the project folder: ").strip()
    output_file = input(
        "Enter the output file name (e.g., project_structure.txt): "
    ).strip()
    write_project_structure(folder_path, output_file)
