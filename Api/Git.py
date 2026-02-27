import subprocess
import sys

def run(command):
    result = subprocess.run(command, shell=True)
    if result.returncode != 0:
        print(f"Erro ao executar: {command}")
        sys.exit(1)

def main():
    message = input("Digite a mensagem do commit: ")

    if not message:
        print("❌ A mensagem do commit não pode ser vazia.")
        message = sys.argv[1]

    print("🔄 Executando git add...")
    run("git add .")

    print("🔄 Executando git add novamente...")
    run("git add .")

    print("📝 Criando commit...")
    run(f'git commit --allow-empty -m "{message}"')

    print("🚀 Enviando para o repositório...")
    run("git push")

    print("✅ Processo concluído com sucesso!")

if __name__ == "__main__":
    main()