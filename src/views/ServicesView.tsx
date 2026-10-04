import ServicesGrid from '@/components/ServicesGrid'

/**
 * Gear is one glass sheet like Projects: the three categories (desk, carry, care),
 * the five gear items with their marks, and the workflow example. No ViewShell: the
 * grid supplies its own head and there is no footer to scroll to.
 */
export default function ServicesView() {
  return (
    <section
      className="pgrid sgrid"
      aria-labelledby="gear-title"
      onWheel={(e) => {
        // Forcefully intercept high-polling gaming mouse delta inputs and scroll the container directly
        e.preventDefault()
        e.stopPropagation()
        const target = e.currentTarget
        target.scrollTop += e.deltaY * 0.5
      }}
      style={{
        maxHeight: '100vh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <ServicesGrid />
    </section>
  )
}
