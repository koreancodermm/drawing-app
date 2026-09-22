import licenses from './licenses.json'

interface Props {
  onBack: () => void
}

/** 앱에 들어 있는 오픈소스 라이브러리와 라이선스 전문(scripts/collect-licenses.mjs가 만든 목록) */
export default function Licenses({ onBack }: Props) {
  return (
    <main className="settings">
      <header className="home__header">
        <h1>오픈소스 고지</h1>
        <button className="btn" onClick={onBack}>
          돌아가기
        </button>
      </header>

      <section className="settings__block">
        <p>이 앱은 아래의 오픈소스 소프트웨어를 사용합니다. 만든 분들께 감사드립니다.</p>
        <p className="settings__hint">
          도구·스티커·패턴·아이콘은 이 앱을 만들면서 직접 그린 것이며, 별도의 이미지나 글꼴 파일을 넣지 않았습니다.
        </p>
      </section>

      <ul className="licenses" aria-label="오픈소스 라이브러리 목록">
        {licenses.map((lib) => (
          <li key={lib.name} className="settings__block">
            <details>
              <summary>
                <strong>{lib.name}</strong> {lib.version} · {lib.license}
              </summary>
              {lib.homepage && (
                <p>
                  <a href={lib.homepage} target="_blank" rel="noreferrer">
                    {lib.homepage}
                  </a>
                </p>
              )}
              <pre className="licenses__text">{lib.text}</pre>
            </details>
          </li>
        ))}
      </ul>
    </main>
  )
}
